from django.urls import path

from . import views

urlpatterns = [
    path("plan/", views.plan, name="workout_ai_plan"),
    path("health/", views.health, name="workout_ai_health"),
]
