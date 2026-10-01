from typing import Optional

from pydantic import BaseModel, Field


class WardrobeItemCreate(BaseModel):
    garment_id: int = Field(..., gt=0)


class WardrobeSaveFromPost(BaseModel):
    class Config:
        anystr_strip_whitespace = True

    post_id: Optional[int] = Field(default=None, gt=0)
    title: str = Field(..., min_length=1, max_length=255)
    brand: Optional[str] = Field(default=None, max_length=255)
    image_url: str = Field(..., min_length=1, max_length=2048)
    category: Optional[str] = Field(default=None, max_length=64)
    price: Optional[str] = Field(default=None, max_length=64)
