import { useDraft, useUnloadWarning } from '../../hooks/useDraft';
import { validateImage, IMAGE_ACCEPT } from '../../utils/validateImage';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { appConfig } from '../../config/appConfig';
import { cancelTryOnSession } from '../../core/application/usecases/cancelTryOnSession';
import { deleteTryOnSession } from '../../core/application/usecases/deleteTryOnSession';
import { getTryOnSession } from '../../core/application/usecases/getTryOnSession';
import { publishTryOnSession } from '../../core/application/usecases/publishTryOnSession';
import { startTryOnSession } from '../../core/application/usecases/startTryOnSession';
import { subscribeToTryOnSession } from '../../core/application/usecases/subscribeToTryOnSession';
import { createApiMediaRepository } from '../../core/infrastructure/repositories/apiMediaRepository';
import { createApiTryOnRepository } from '../../core/infrastructure/repositories/apiTryOnRepository';
import { useAuth } from '../../hooks/useAuth';
import './TryOnPage.css';

const INFERENCE_STEPS = ['Подбираем стиль', 'Уточняем посадку', 'Собираем образ', 'Финальные штрихи'];
const SESSION_STATUS_POLL_INTERVAL_MS = 5000;
const MAX_PROCESSING_SECONDS = appConfig.tryOnMaxProcessingSeconds;
const tryOnRepository = createApiTryOnRepository();
const mediaRepository = createApiMediaRepository();

const resolveProcessingStepIndex = (elapsedSeconds) => {
  if (elapsedSeconds < 60) {
    return 1;
  }
  if (elapsedSeconds < 180) {
    return 2;
  }
  return 3;
};

const resolveProgressByStatus = (status, elapsedSeconds) => {
  if (status === 'queued') {
    return 12;
  }
  if (status === 'processing') {
    if (elapsedSeconds < 60) {
      return 30;
    }
    if (elapsedSeconds < 180) {
      return 58;
    }
    return 86;
  }
  if (status === 'completed') {
    return 100;
  }
  return 0;
};

const persistProfilePhotos = (photos, index) => {
  localStorage.setItem('tryOnPhotos', JSON.stringify(photos));
  localStorage.setItem('primaryPhotoIndex', String(index));
};

const normalizeProfilePhoto = (media) => ({
  id: media.id,
  mediaId: media.id,
  url: media.public_url,
  name: `Фото ${media.id}`,
  date: media.created_at ? new Date(media.created_at).toLocaleDateString() : new Date().toLocaleDateString()
});

const isTryOnMediaAsset = (media) => {
  const key = String(media?.storage_key || '').toLowerCase();
  return key.includes('/tryon/') || key.includes('\\tryon\\');
};

const readPrimaryProfilePhoto = () => {
  try {
    const photosRaw = localStorage.getItem('tryOnPhotos');
    const indexRaw = localStorage.getItem('primaryPhotoIndex');
    const photos = photosRaw ? JSON.parse(photosRaw) : [];
    const parsedIndex = indexRaw ? Number(indexRaw) : 0;
    const safeIndex =
      Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < photos.length ? parsedIndex : 0;

    return {
      photo: Array.isArray(photos) && photos.length > 0 ? photos[safeIndex]?.url || '' : '',
      count: Array.isArray(photos) ? photos.length : 0,
      index: safeIndex
    };
  } catch (error) {
    return { photo: '', count: 0, index: 0 };
  }
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const TryOnPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth } = useAuth();
  const clothInputRef = useRef(null);
  const autoStartTriggeredRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const websocketRef = useRef(null);
  const terminalStatusSeenRef = useRef(false);
  const timeoutHandledRef = useRef(false);

  const presetClothPhoto = location.state?.clothPhoto || location.state?.photo || '';
  const [profileInfo, setProfileInfo] = useState(readPrimaryProfilePhoto);
  const [clothFile, setClothFile] = useState(null);
  const [clothPreview, setClothPreview] = useState(presetClothPhoto);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [serverStatus, setServerStatus] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishCaption, setPublishCaption] = useDraft(`publish:Caption:${user?.id}:${sessionId}`);
  const [publishHashtags, setPublishHashtags] = useDraft(`publish:Hashtags:${user?.id}:${sessionId}`);
  const [publishPhase, setPublishPhase] = useState('idle');

  useUnloadWarning(Boolean(clothFile) || isProcessing || Boolean(publishCaption || publishHashtags));

  const outfit = location.state?.outfit || {
    brand: 'Бренд не указан',
    type: 'Одежда',
    price: 'Цена не указана'
  };

  const shouldAutoStart = Boolean(location.state?.autoStart);
  const profileModelPhoto = profileInfo.photo;
  const clothSourceLabel = clothFile
    ? 'Загружено пользователем'
    : presetClothPhoto
      ? 'Выбрано из ленты'
      : 'Фото не выбрано';

  const closeTryOnSocket = () => {
    if (!websocketRef.current) {
      return;
    }

    websocketRef.current.close();
    websocketRef.current = null;
  };

  const applySessionUpdate = (payload) => {
    const nextStatus = String(payload?.status || '').toLowerCase();
    if (!nextStatus) {
      return;
    }

    setServerStatus(nextStatus);

    if (nextStatus === 'queued') {
      setProgress((current) => Math.max(current, resolveProgressByStatus(nextStatus, elapsedSeconds)));
      setActiveStepIndex((current) => Math.max(current, 0));
      return;
    }

    if (nextStatus === 'processing') {
      setProgress((current) => Math.max(current, resolveProgressByStatus(nextStatus, elapsedSeconds)));
      setActiveStepIndex((current) =>
        Math.max(current, Math.min(resolveProcessingStepIndex(elapsedSeconds), INFERENCE_STEPS.length - 1))
      );
      return;
    }

    if (nextStatus === 'completed') {
      terminalStatusSeenRef.current = true;
      timeoutHandledRef.current = false;
      setIsCancelling(false);
      setProgress(100);
      setActiveStepIndex(INFERENCE_STEPS.length - 1);
      setResultImage(payload?.result_image_url || '');
      setIsProcessing(false);
      closeTryOnSocket();
      return;
    }

    if (nextStatus === 'failed') {
      terminalStatusSeenRef.current = true;
      timeoutHandledRef.current = false;
      setIsCancelling(false);
      setError(payload?.error_text || 'Примерка завершилась с ошибкой.');
      setIsProcessing(false);
      closeTryOnSocket();
      return;
    }

    if (nextStatus === 'canceled') {
      terminalStatusSeenRef.current = true;
      timeoutHandledRef.current = false;
      setIsCancelling(false);
      setError(payload?.error_text || 'Примерка отменена.');
      setIsProcessing(false);
      closeTryOnSocket();
    }
  };

  const syncTryOnSession = async (nextSessionId) => {
    const payload = await getTryOnSession(tryOnRepository, nextSessionId);
    applySessionUpdate(payload);
  };

  const connectToTryOnSession = (nextSessionId) => {
    closeTryOnSocket();
    websocketRef.current = subscribeToTryOnSession(tryOnRepository, nextSessionId, {
      onMessage: (payload) => {
        applySessionUpdate(payload);
      },
      onError: async () => {
        if (terminalStatusSeenRef.current) {
          return;
        }

        try {
          await syncTryOnSession(nextSessionId);
        } catch (sessionError) {
          setError(sessionError?.message || 'Не удалось получить статус try-on сессии.');
          setIsProcessing(false);
        }
      },
      onClose: async () => {
        websocketRef.current = null;

        if (terminalStatusSeenRef.current) {
          return;
        }

        try {
          await syncTryOnSession(nextSessionId);
        } catch (sessionError) {
          setError(sessionError?.message || 'Соединение с try-on сессией прервалось.');
          setIsProcessing(false);
        }
      }
    });
  };

  useEffect(() => {
    const syncProfilePhoto = () => {
      setProfileInfo(readPrimaryProfilePhoto());
    };

    syncProfilePhoto();
    window.addEventListener('storage', syncProfilePhoto);
    return () => window.removeEventListener('storage', syncProfilePhoto);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncProfilePhotoFromServer = async () => {
      try {
        const mediaItems = await mediaRepository.fetchMyMedia();
        if (cancelled || !Array.isArray(mediaItems) || mediaItems.length === 0) {
          return;
        }

        const photos = mediaItems
          .filter((item) => !isTryOnMediaAsset(item))
          .map(normalizeProfilePhoto);
        const savedIndex = Number(localStorage.getItem('primaryPhotoIndex') || 0);
        const safeIndex =
          Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < photos.length ? savedIndex : 0;
        persistProfilePhotos(photos, safeIndex);
        setProfileInfo({
          photo: photos[safeIndex]?.url || '',
          count: photos.length,
          index: safeIndex
        });
      } catch (error) {
        // Keep the local cache fallback when backend media cannot be loaded.
      }
    };

    void syncProfilePhotoFromServer();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setClothPreview(presetClothPhoto);
    setClothFile(null);
    setResultImage('');
    setError('');
    setSessionId(null);
    setServerStatus('');
    setIsCancelling(false);
    setIsPublishing(false);
    setIsSaved(false);
    setIsPublished(false);
    setIsPublishModalOpen(false);
    setPublishPhase('idle');
    terminalStatusSeenRef.current = false;
    timeoutHandledRef.current = false;
    closeTryOnSocket();
    autoStartTriggeredRef.current = false;
  }, [presetClothPhoto]);

  useEffect(() => () => {
    closeTryOnSocket();
  }, []);

  const handlePickClothPhoto = () => {
    clothInputRef.current?.click();
  };

  const handleClothChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const input = event.target;
    if (isProcessing) return;
    try {
      await validateImage(file);
      const preview = await fileToDataUrl(file);
      setClothFile(file);
      setClothPreview(preview);
      setResultImage('');
      setSessionId(null);
      setError('');
    } catch (error) {
      setError(error.message);
    } finally {
      input.value = '';
    }
  };

  const handleTryOn = async () => {
    if (user?.isGuest) {
      setError('Гостевой режим не поддерживает примерку. Войдите или зарегистрируйтесь.');
      return;
    }
    if (requestInFlightRef.current || isProcessing) {
      return;
    }

    const clothImageInput = clothFile || clothPreview;

    if (!profileModelPhoto) {
      setError('Сначала добавьте и выберите основное фото в профиле.');
      return;
    }

    if (!clothImageInput) {
      setError('Выберите одежду из ленты или загрузите фото одежды.');
      return;
    }

    requestInFlightRef.current = true;
    setIsProcessing(true);
    setError('');
    setResultImage('');
    setProgress(3);
    setElapsedSeconds(0);
    setActiveStepIndex(0);
    setSessionId(null);
    setServerStatus('');
    setIsCancelling(false);
    setIsPublishing(false);
    setIsSaved(false);
    setIsPublished(false);
    setIsPublishModalOpen(false);
    setPublishPhase('idle');
    terminalStatusSeenRef.current = false;
    timeoutHandledRef.current = false;
    closeTryOnSocket();

    try {
      const payload = await startTryOnSession(tryOnRepository, {
        modelImage: profileModelPhoto,
        clothImage: clothImageInput,
        modelType: 'hd',
        category: 0,
        scale: 2.0,
        numSteps: 20,
        numSamples: 1,
        seed: -1
      });

      setSessionId(payload.sessionId || null);
      if (payload.resultUrl) {
        terminalStatusSeenRef.current = true;
        setServerStatus(payload.status || 'completed');
        setProgress(100);
        setActiveStepIndex(INFERENCE_STEPS.length - 1);
        setResultImage(payload.resultUrl);
        setIsProcessing(false);
        return;
      }

      if (!payload.sessionId) {
        throw new Error('Сервер не вернул session_id для try-on задачи.');
      }

      setSessionId(payload.sessionId);
      setServerStatus(payload.status || (payload.queued ? 'queued' : 'processing'));
      setProgress(payload.queued ? 12 : 20);
      connectToTryOnSession(payload.sessionId);
    } catch (requestError) {
      setError(requestError?.message || 'Ошибка обработки примерки');
      setIsProcessing(false);
    } finally {
      requestInFlightRef.current = false;
    }
  };

  const handleSaveResult = () => {
    if (!resultImage) {
      return;
    }

    setIsSaved(true);
    setError('');
  };

  const handlePublishResult = async () => {
    if (!sessionId || !resultImage || isPublishing || isPublished) {
      return;
    }

    setIsPublishing(true);
    setPublishPhase('publishing');
    setError('');
    try {
      const sourceType = clothFile ? 'upload' : (presetClothPhoto ? 'feed' : null);
      const sourcePostId = Number(location.state?.postId || 0) || null;
      const hashtags = publishHashtags
        .split(/[,\s]+/g)
        .map((item) => item.trim().replace(/^#/, ''))
        .filter(Boolean);
      await publishTryOnSession(tryOnRepository, sessionId, {
        caption: publishCaption,
        sourceType,
        sourcePostId,
        hashtags
      });
      setIsSaved(true);
      setIsPublished(true);
      setPublishCaption('');
      setPublishHashtags('');
      setPublishPhase('success');
      setTimeout(() => {
        setIsPublishModalOpen(false);
      }, 900);
    } catch (publishError) {
      setError(publishError?.message || 'Не удалось создать пост из примерки');
      setPublishPhase('error');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteTryOnResult = async () => {
    if (!sessionId || isProcessing) {
      return;
    }

    if (!window.confirm('Удалить эту примерку? Действие нельзя отменить.')) return;
    setError('');
    try {
      await deleteTryOnSession(tryOnRepository, sessionId);
      setResultImage('');
      setSessionId(null);
      setServerStatus('');
      setIsSaved(false);
      setIsPublished(false);
      setIsPublishModalOpen(false);
      setPublishCaption('');
      setPublishHashtags('');
      setPublishPhase('idle');
    } catch (deleteError) {
      setError(deleteError?.message || 'Не удалось удалить примерку');
    }
  };

  const handleCancelTryOn = async () => {
    if (!sessionId || !isProcessing || isCancelling) {
      return;
    }

    setIsCancelling(true);
    try {
      const payload = await cancelTryOnSession(tryOnRepository, sessionId);
      applySessionUpdate(payload);
    } catch (cancelError) {
      setIsCancelling(false);
      setError(cancelError?.message || 'Не удалось отменить примерку.');
    }
  };

  const goToProfileWithNav = () => {
    navigate('/', { state: { openTab: 'profile' } });
  };

  const exitGuestAndNavigate = (path) => {
    clearAuth();
    navigate(path);
  };

  useEffect(() => {
    if (!shouldAutoStart || autoStartTriggeredRef.current) {
      return;
    }

    if (!profileModelPhoto || !clothPreview) {
      return;
    }

    const autoStartKey = `tryon-autostart:${location.key || 'default'}`;
    try {
      if (sessionStorage.getItem(autoStartKey) === '1') {
        autoStartTriggeredRef.current = true;
        return;
      }
      sessionStorage.setItem(autoStartKey, '1');
    } catch (storageError) {
      // Ignore storage limitations in private mode.
    }

    autoStartTriggeredRef.current = true;
    void handleTryOn();
  }, [clothPreview, location.key, profileModelPhoto, shouldAutoStart]);

  useEffect(() => {
    if (!isProcessing) {
      return;
    }

    const elapsedTimer = window.setInterval(() => {
      setElapsedSeconds((sec) => {
        const next = sec + 1;
        const status = String(serverStatus || '').toLowerCase();
        if (status === 'processing') {
          setActiveStepIndex((current) =>
            Math.max(current, Math.min(resolveProcessingStepIndex(next), INFERENCE_STEPS.length - 1))
          );
        }
        if (status) {
          setProgress((current) => Math.max(current, resolveProgressByStatus(status, next)));
        }
        if (
          MAX_PROCESSING_SECONDS > 0 &&
          next >= MAX_PROCESSING_SECONDS &&
          !terminalStatusSeenRef.current &&
          !timeoutHandledRef.current
        ) {
          timeoutHandledRef.current = true;
          terminalStatusSeenRef.current = true;
          closeTryOnSocket();
          setIsProcessing(false);
          setError('Ожидание затянулось. Примерка может продолжаться на сервере — проверьте недавние примерки в профиле.');
        }
        return next;
      });
    }, 1000);

    return () => {
      window.clearInterval(elapsedTimer);
    };
  }, [isProcessing, serverStatus]);

  useEffect(() => {
    if (!isProcessing || !sessionId) {
      return;
    }

    const pollingTimer = window.setInterval(() => {
      if (terminalStatusSeenRef.current) {
        return;
      }

      void syncTryOnSession(sessionId).catch(() => {});
    }, SESSION_STATUS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollingTimer);
    };
  }, [isProcessing, sessionId]);

  if (user?.isGuest) {
    return (
      <div className="tryon-page">
        <header className="tryon-page__header">
          <button className="tryon-page__back" onClick={() => navigate('/')}>
            Назад
          </button>
          <h1 className="tryon-page__title">Примерка</h1>
          <button className="tryon-page__link" onClick={() => navigate('/profile')}>
            Профиль
          </button>
        </header>

        <div className="tryon-page__content">
          <section className="tryon-card tryon-guest-lock">
            <h2>Примерка недоступна в гостевом режиме</h2>
            <p>Чтобы запускать примерку, войдите в аккаунт или создайте новый профиль.</p>
            <div className="tryon-result-actions">
              <button className="tryon-btn tryon-btn--secondary" onClick={() => exitGuestAndNavigate('/login')}>
                Войти
              </button>
              <button className="tryon-btn tryon-btn--primary" onClick={() => exitGuestAndNavigate('/register')}>
                Зарегистрироваться
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="tryon-page">
      <header className="tryon-page__header">
        <button className="tryon-page__back" onClick={() => navigate('/')}>
          Назад
        </button>
        <h1 className="tryon-page__title">Примерка</h1>
        <button className="tryon-page__link" onClick={goToProfileWithNav}>
          Профиль
        </button>
      </header>

      <div className="tryon-page__content">
        <section className="tryon-card tryon-card--meta">
          <div className="tryon-meta">
            <span className="tryon-meta__label">Бренд</span>
            <span className="tryon-meta__value">{outfit.brand}</span>
          </div>
          <div className="tryon-meta">
            <span className="tryon-meta__label">Тип</span>
            <span className="tryon-meta__value">{outfit.type}</span>
          </div>
          <div className="tryon-meta">
            <span className="tryon-meta__label">Цена</span>
            <span className="tryon-meta__value">{outfit.price}</span>
          </div>
        </section>

        <section className="tryon-grid">
          <article className="tryon-card">
            <div className="tryon-card__head">
              <h2>Фото из профиля</h2>
              <span className="tryon-badge">
                {profileInfo.count > 0 ? `Основное ${profileInfo.index + 1}/${profileInfo.count}` : 'Не выбрано'}
              </span>
            </div>
            {profileModelPhoto ? (
              <img className="tryon-photo" src={profileModelPhoto} alt="Фото пользователя" />
            ) : (
              <div className="tryon-empty">Добавьте фото в профиле и отметьте его как основное</div>
            )}
          </article>

          <article className="tryon-card">
            <div className="tryon-card__head">
              <h2>Одежда</h2>
              <span className="tryon-badge tryon-badge--source">{clothSourceLabel}</span>
            </div>
            {clothPreview ? (
              <img className="tryon-photo tryon-photo--cloth" src={clothPreview} alt="Фото одежды" />
            ) : (
              <div className="tryon-empty">Откройте примерку из ленты или загрузите фото одежды вручную</div>
            )}
          </article>
        </section>

        <section className="tryon-actions">
          <button className="tryon-btn tryon-btn--secondary" onClick={goToProfileWithNav}>
            Выбрать фото в профиле
          </button>
          <button className="tryon-btn tryon-btn--secondary" onClick={handlePickClothPhoto} disabled={isProcessing}>
            Загрузить одежду
          </button>
          <button className="tryon-btn tryon-btn--primary" onClick={handleTryOn} disabled={isProcessing || !profileModelPhoto || !(clothFile || clothPreview)}>
            {isProcessing ? 'Создаем образ...' : 'Запустить примерку'}
          </button>
        </section>

        {!profileModelPhoto && <p>Для запуска добавьте основное фото в профиле.</p>}
        {!(clothFile || clothPreview) && <p>Для запуска выберите фотографию одежды.</p>}
        {error && <div role="alert" className="tryon-alert tryon-alert--error">{error}</div>}

        {isProcessing && (
          <section className="tryon-card tryon-card--status">
            <div className="tryon-loader" />
            <p className="tryon-status-title">Создаем вашу примерку</p>
            {sessionId && (
              <p className="tryon-status-subtitle">
                Сессия #{sessionId} · {serverStatus || 'queued'}
              </p>
            )}
            <p className="tryon-status-subtitle">
              {INFERENCE_STEPS[activeStepIndex]} · {elapsedSeconds}с
            </p>
            <div className="tryon-progress">
              <div className="tryon-progress__bar" style={{ width: `${progress}%` }} />
            </div>
            <div className="tryon-steps">
              {INFERENCE_STEPS.map((step, index) => (
                <div
                  key={step}
                  className={`tryon-step ${index <= activeStepIndex ? 'is-active' : ''}`}
                >
                  {step}
                </div>
              ))}
            </div>
            <div className="tryon-result-actions">
              <button
                className="tryon-btn tryon-btn--secondary"
                onClick={handleCancelTryOn}
                disabled={isCancelling}
              >
                {isCancelling ? 'Отменяем...' : 'Отменить примерку'}
              </button>
            </div>
          </section>
        )}

        {resultImage && !isProcessing && (
          <section className="tryon-card tryon-card--result">
            <h2>Результат примерки</h2>
            <img className="tryon-result-image" src={resultImage} alt="Результат примерки" />
            <div className="tryon-result-actions">
              <button className="tryon-btn tryon-btn--secondary" onClick={handleSaveResult}>
                {isSaved ? 'Сохранено' : 'Сохранить'}
              </button>
              <button
                className="tryon-btn tryon-btn--danger"
                onClick={handleDeleteTryOnResult}
                disabled={!sessionId || isProcessing}
              >
                Удалить
              </button>
              <button
                className="tryon-btn tryon-btn--primary"
                onClick={() => setIsPublishModalOpen(true)}
                disabled={isPublishing || isPublished || !sessionId}
              >
                {isPublished ? 'Пост опубликован' : isPublishing ? 'Публикуем...' : 'Сохранить и сделать пост'}
              </button>
            </div>
          </section>
        )}

        {isPublishModalOpen && (
          <div className="profile-modal-backdrop" onClick={() => setIsPublishModalOpen(false)}>
            <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
              <h3>Публикация образа</h3>
              <p className="profile-modal-date">Добавьте подпись к посту (необязательно)</p>
              <textarea
                className="profile-modal-input"
                maxLength={2000}
                value={publishCaption}
                onChange={(event) => setPublishCaption(event.target.value)}
                rows={4}
                placeholder="Например: Мой образ на вечер"
              />
              <input
                className="profile-modal-input"
                value={publishHashtags}
                onChange={(event) => setPublishHashtags(event.target.value)}
                placeholder="Хэштеги: #streetwear #look (или через запятую)"
              />
              <div className={`publish-status-chip ${publishPhase}`}>
                {publishPhase === 'publishing' && 'Публикуем пост...'}
                {publishPhase === 'success' && 'Готово. Пост опубликован'}
                {publishPhase === 'error' && 'Ошибка публикации'}
                {publishPhase === 'idle' && 'Заполните поля и нажмите "Опубликовать"'}
              </div>
              <div className={`publish-progress ${publishPhase === 'publishing' ? 'is-running' : ''} ${publishPhase === 'success' ? 'is-success' : ''}`}>
                <div className="publish-progress__bar" />
              </div>
              <div className="profile-modal-actions">
                <button type="button" className="profile-modal-cancel" onClick={() => setIsPublishModalOpen(false)}>
                  Отмена
                </button>
                <button type="button" className="edit-profile-btn" onClick={handlePublishResult} disabled={isPublishing}>
                  {isPublishing ? 'Публикуем...' : 'Опубликовать'}
                </button>
              </div>
            </div>
          </div>
        )}

        <input
          ref={clothInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          style={{ display: 'none' }}
          onChange={handleClothChange}
        />
      </div>
    </div>
  );
};

export default TryOnPage;
