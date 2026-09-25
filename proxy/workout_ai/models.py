from django.db import models


class PlanRequest(models.Model):
    """One call to Claude, kept only to enforce the daily limit per user. No inputs or photos are stored."""
    uid = models.CharField(max_length=128, db_index=True)
    created = models.DateTimeField(auto_now_add=True, db_index=True)
    ok = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.uid} {self.created:%Y-%m-%d %H:%M}"
