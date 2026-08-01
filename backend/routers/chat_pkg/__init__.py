"""Chat router package — split from the monolithic chat.py for maintainability."""

from fastapi import APIRouter

from .rooms import router as rooms_router
from .messages import router as messages_router
from .features import router as features_router

router = APIRouter()

router.include_router(rooms_router)
router.include_router(messages_router)
router.include_router(features_router)
