import importlib
import sys
import types

import pytest
from PIL import Image


def stub_ml_modules():
    ml_pkg = types.ModuleType("swipeit_ml")
    application_pkg = types.ModuleType("swipeit_ml.application")
    usecases_pkg = types.ModuleType("swipeit_ml.application.usecases")
    usecases_module = types.ModuleType("swipeit_ml.application.usecases.run_ootd_inference")
    domain_pkg = types.ModuleType("swipeit_ml.domain")
    entities_module = types.ModuleType("swipeit_ml.domain.entities")
    enums_module = types.ModuleType("swipeit_ml.domain.enums")
    infrastructure_pkg = types.ModuleType("swipeit_ml.infrastructure")
    adapters_module = types.ModuleType("swipeit_ml.infrastructure.adapters")

    class OpenPoseAdapter:
        def __init__(self, gpu_id):
            self.gpu_id = gpu_id

    class ParsingAdapter:
        def __init__(self, gpu_id):
            self.gpu_id = gpu_id

    class DiffusionAdapter:
        def __init__(self, gpu_id, model_type):
            self.gpu_id = gpu_id
            self.model_type = model_type

    class InferenceRequest:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class ModelType:
        HD = "hd"
        DC = "dc"

        def __new__(cls, value):
            return value

    def category_from_index(index):
        return ["upperbody", "lowerbody", "dress"][index]

    class RunOOTDInference:
        def __init__(self, openpose, parsing, diffusion):
            self.openpose = openpose
            self.parsing = parsing
            self.diffusion = diffusion

        def execute(self, request):
            return types.SimpleNamespace(outputs=[Image.new("RGB", (20, 30), "white")])

    adapters_module.OpenPoseAdapter = OpenPoseAdapter
    adapters_module.ParsingAdapter = ParsingAdapter
    adapters_module.DiffusionAdapter = DiffusionAdapter
    entities_module.InferenceRequest = InferenceRequest
    domain_pkg.ModelType = ModelType
    domain_pkg.category_from_index = category_from_index
    enums_module.ModelType = ModelType
    enums_module.category_from_index = category_from_index
    usecases_module.RunOOTDInference = RunOOTDInference
    usecases_pkg.RunOOTDInference = RunOOTDInference

    return {
        "swipeit_ml": ml_pkg,
        "swipeit_ml.application": application_pkg,
        "swipeit_ml.application.usecases": usecases_pkg,
        "swipeit_ml.application.usecases.run_ootd_inference": usecases_module,
        "swipeit_ml.domain": domain_pkg,
        "swipeit_ml.domain.entities": entities_module,
        "swipeit_ml.domain.enums": enums_module,
        "swipeit_ml.infrastructure": infrastructure_pkg,
        "swipeit_ml.infrastructure.adapters": adapters_module,
    }


def load_module(monkeypatch):
    for name, module in stub_ml_modules().items():
        monkeypatch.setitem(sys.modules, name, module)
    sys.modules.pop("app.infrastructure.ml.ootd_service", None)
    return importlib.import_module("app.infrastructure.ml.ootd_service")


def test_health_check_and_singleton(monkeypatch):
    module = load_module(monkeypatch)
    module._service = None

    service = module.get_ootd_service()

    health = service.health_check()
    assert health["status"] == "ready"
    assert health["model"] == "OOTDiffusion"
    assert "gpu_id" in health
    assert "cuda_available" in health
    assert "gpu_name" in health
    assert module.get_ootd_service() is service


def test_try_on_raises_for_invalid_hd_category(monkeypatch):
    module = load_module(monkeypatch)
    service = module.OOTDService()

    with pytest.raises(ValueError):
        service.try_on(Image.new("RGB", (10, 10)), Image.new("RGB", (10, 10)), model_type="hd", category=1)


def test_try_on_initializes_runner_once_and_returns_outputs(monkeypatch):
    module = load_module(monkeypatch)

    executions = []

    class FakeRunner:
        def __init__(self, openpose, parsing, diffusion):
            self.init_args = (openpose, parsing, diffusion)

        def execute(self, request):
            executions.append(request)
            return types.SimpleNamespace(outputs=[Image.new("RGB", (20, 30), "white")])

    monkeypatch.setattr(module, "RunOOTDInference", FakeRunner)

    service = module.OOTDService(gpu_id=3)
    first = service.try_on(Image.new("RGB", (10, 10)), Image.new("RGB", (10, 10)), model_type="dc", category=2)
    second = service.try_on(Image.new("RGB", (10, 10)), Image.new("RGB", (10, 10)), model_type="dc", category=2)

    assert len(first) == 1
    assert len(second) == 1
    assert len(executions) == 2
    assert executions[0].category == "dress"
    assert service._runner is not None
