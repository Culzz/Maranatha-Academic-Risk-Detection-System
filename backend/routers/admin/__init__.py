"""Admin router package — re-exports a combined router from all sub-modules."""

from fastapi import APIRouter

from .overview import router as overview_router
from .users import router as users_router
from .courses import router as courses_router
from .model import router as model_router
from .whitelist import router as whitelist_router
from .sessions import router as sessions_router
from .settings import router as settings_router
from .sos import router as sos_router
from .hod import router as hod_router
from .audit import router as audit_router
from .departments import router as departments_router
from .dead_letters import router as dead_letters_router

router = APIRouter()
router.include_router(overview_router)
router.include_router(users_router)
router.include_router(courses_router)
router.include_router(model_router)
router.include_router(whitelist_router)
router.include_router(sessions_router)
router.include_router(settings_router)
router.include_router(sos_router)
router.include_router(hod_router)
router.include_router(audit_router)
router.include_router(departments_router)
router.include_router(dead_letters_router)
