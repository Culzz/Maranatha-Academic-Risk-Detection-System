"""
Email delivery service.

- DEBUG=True  → Emails logged to console, confirmation links returned to caller.
- DEBUG=False → Real emails sent via SMTP. Falls back to console if not configured.
"""

import smtplib
import time
import logging
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import get_settings

log = logging.getLogger("maranatha")
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def _build_confirmation_email(recipient_name: str, confirm_url: str, role: str) -> tuple[str, str]:
    """Return (subject, html_body) for a confirmation email."""
    subject = "Confirm Your Maranatha University Account"
    html = f"""\
<html>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; padding: 40px 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px;
              box-shadow: 0 2px 12px rgba(0,0,0,.08); overflow: hidden;">
    <div style="background: #0a1628; padding: 28px 32px;">
      <h1 style="color: #d4a843; margin: 0; font-size: 20px;">Maranatha University</h1>
      <p style="color: rgba(255,255,255,.7); margin: 6px 0 0; font-size: 13px;">
        Academic Risk Detection System
      </p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px;">
        Hello <strong>{recipient_name}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Thank you for registering as a <strong>{role}</strong>. Please confirm your
        email address by clicking the button below:
      </p>
      <div style="text-align: center; margin: 0 0 24px;">
        <a href="{confirm_url}"
           style="display: inline-block; background: #d4a843; color: #0a1628;
                  padding: 12px 32px; border-radius: 8px; text-decoration: none;
                  font-weight: 600; font-size: 14px;">
          Confirm Email
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0;">
        If the button doesn't work, copy and paste this link:<br>
        <a href="{confirm_url}" style="color: #d4a843; word-break: break-all;">{confirm_url}</a>
      </p>
    </div>
    <div style="background: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0;">
      <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
        This link expires in 24 hours. If you didn't register, ignore this email.
      </p>
    </div>
  </div>
</body>
</html>"""
    return subject, html


def _build_lecturer_invite_email(recipient_name: str, email: str, staff_id: str,
                                  register_url: str) -> tuple[str, str]:
    """Return (subject, html_body) for a lecturer invitation email."""
    subject = "You've Been Invited to Join Maranatha University System"
    html = f"""\
<html>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; padding: 40px 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px;
              box-shadow: 0 2px 12px rgba(0,0,0,.08); overflow: hidden;">
    <div style="background: #0a1628; padding: 28px 32px;">
      <h1 style="color: #d4a843; margin: 0; font-size: 20px;">Maranatha University</h1>
      <p style="color: rgba(255,255,255,.7); margin: 6px 0 0; font-size: 13px;">
        Academic Risk Detection System
      </p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px;">
        Hello <strong>{recipient_name}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 8px;">
        You have been invited to register as a <strong>Lecturer</strong> on the
        Maranatha Academic Risk Detection System.
      </p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0 24px;
                  border: 1px solid #e2e8f0;">
        <p style="margin: 0 0 6px; font-size: 13px; color: #64748b;">Your credentials:</p>
        <p style="margin: 0; font-size: 14px; color: #1e293b;">
          <strong>Email:</strong> {email}<br>
          <strong>Staff ID:</strong> {staff_id}
        </p>
      </div>
      <div style="text-align: center; margin: 0 0 24px;">
        <a href="{register_url}"
           style="display: inline-block; background: #d4a843; color: #0a1628;
                  padding: 12px 32px; border-radius: 8px; text-decoration: none;
                  font-weight: 600; font-size: 14px;">
          Register Now
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        This invitation expires in 30 minutes.
      </p>
    </div>
  </div>
</body>
</html>"""
    return subject, html


def _send_smtp(to_email: str, subject: str, html_body: str, max_attempts: int = 3) -> dict:
    """Send an email via SMTP with exponential backoff retry."""
    settings = get_settings()
    if not _EMAIL_RE.match((to_email or "").strip()):
        log.warning("Invalid email format, skipping SMTP send: %s", to_email)
        return {"sent": False, "reason": "invalid_email"}

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    for attempt in range(1, max_attempts + 1):
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
            log.info("Email sent to %s — %s", to_email, subject)
            return {"sent": True}
        except Exception as exc:
            log.warning("Email attempt %d/%d to %s failed: %s", attempt, max_attempts, to_email, exc)
            if attempt < max_attempts:
                time.sleep(2 ** (attempt - 1))
    log.error("Email delivery failed after %d attempts to %s", max_attempts, to_email)
    return {"sent": False, "error": "All retry attempts failed"}


# ── Public API ────────────────────────────────────────────────────────────


def send_confirmation_email(to_email: str, recipient_name: str, token: str, role: str) -> dict:
    """
    Send an account confirmation email.

    Returns:
        sent      — True if email was dispatched via SMTP.
        dev_link  — The confirmation URL in dev mode (None in production).
    """
    settings = get_settings()
    confirm_url = f"{settings.frontend_url}/confirm-email?token={token}"
    subject, html = _build_confirmation_email(recipient_name, confirm_url, role)

    if settings.debug:
        log.info("[DEV] Confirm %s (%s): %s", role, to_email, confirm_url)
        return {"sent": False, "dev_link": confirm_url}

    if not settings.smtp_host or not settings.smtp_user:
        log.warning("SMTP not configured — confirm link for %s: %s", to_email, confirm_url)
        return {"sent": False, "dev_link": confirm_url}

    result = _send_smtp(to_email, subject, html)
    result["dev_link"] = None
    return result


def _build_password_reset_email(recipient_name: str, reset_url: str) -> tuple[str, str]:
    """Return (subject, html_body) for a password reset email."""
    subject = "Reset Your Maranatha University Password"
    html = f"""\
<html>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; padding: 40px 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px;
              box-shadow: 0 2px 12px rgba(0,0,0,.08); overflow: hidden;">
    <div style="background: #0a1628; padding: 28px 32px;">
      <h1 style="color: #d4a843; margin: 0; font-size: 20px;">Maranatha University</h1>
      <p style="color: rgba(255,255,255,.7); margin: 6px 0 0; font-size: 13px;">
        Academic Risk Detection System
      </p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px;">
        Hello <strong>{recipient_name}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        We received a request to reset your password. Click the button below to
        choose a new password:
      </p>
      <div style="text-align: center; margin: 0 0 24px;">
        <a href="{reset_url}"
           style="display: inline-block; background: #d4a843; color: #0a1628;
                  padding: 12px 32px; border-radius: 8px; text-decoration: none;
                  font-weight: 600; font-size: 14px;">
          Reset Password
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0;">
        If the button doesn't work, copy and paste this link:<br>
        <a href="{reset_url}" style="color: #d4a843; word-break: break-all;">{reset_url}</a>
      </p>
    </div>
    <div style="background: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0;">
      <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
        This link expires in 1 hour. If you didn't request a password reset, ignore this email.
      </p>
    </div>
  </div>
</body>
</html>"""
    return subject, html


def send_password_reset_email(to_email: str, recipient_name: str, token: str) -> dict:
    """
    Send a password reset email.

    Returns:
        sent      — True if dispatched via SMTP.
        dev_link  — The reset URL in dev mode (None in production).
    """
    settings = get_settings()
    reset_url = f"{settings.frontend_url}/reset-password?token={token}"
    subject, html = _build_password_reset_email(recipient_name, reset_url)

    if settings.debug:
        log.info("[DEV] Password reset for %s: %s", to_email, reset_url)
        return {"sent": False, "dev_link": reset_url}

    if not settings.smtp_host or not settings.smtp_user:
        log.warning("SMTP not configured — reset link for %s: %s", to_email, reset_url)
        return {"sent": False, "dev_link": reset_url}

    result = _send_smtp(to_email, subject, html)
    result["dev_link"] = None
    return result


def send_lecturer_invite_email(to_email: str, full_name: str, staff_id: str) -> dict:
    """
    Send a lecturer invitation email with staff ID and register link.

    Returns:
        sent      — True if email was dispatched.
        dev_link  — The registration URL in dev mode (None in production).
    """
    settings = get_settings()
    register_url = f"{settings.frontend_url}/register/lecturer"
    subject, html = _build_lecturer_invite_email(full_name, to_email, staff_id, register_url)

    if settings.debug:
        log.info("[DEV] Lecturer invite to %s: Staff ID=%s, URL=%s", to_email, staff_id, register_url)
        return {"sent": False, "dev_link": register_url}

    if not settings.smtp_host or not settings.smtp_user:
        log.warning("SMTP not configured — invite for %s: %s", to_email, register_url)
        return {"sent": False, "dev_link": register_url}

    result = _send_smtp(to_email, subject, html)
    result["dev_link"] = None
    return result


# ── Intervention / Risk / Progress emails ─────────────────────────────────


def _build_intervention_email(student_name: str, intervention_title: str,
                               message_body: str) -> tuple[str, str]:
    """Return (subject, html_body) for an intervention notification email."""
    subject = f"Maranatha — {intervention_title}"
    html = f"""\
<html>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; padding: 40px 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px;
              box-shadow: 0 2px 12px rgba(0,0,0,.08); overflow: hidden;">
    <div style="background: #0a1628; padding: 28px 32px;">
      <h1 style="color: #d4a843; margin: 0; font-size: 20px;">Maranatha University</h1>
      <p style="color: rgba(255,255,255,.7); margin: 6px 0 0; font-size: 13px;">
        Academic Risk Detection System
      </p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px;">
        Hello <strong>{student_name}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 8px;">
        You have a new intervention recommendation:
      </p>
      <div style="background: #fef3c7; border-left: 4px solid #d4a843; padding: 16px; margin: 16px 0;
                  border-radius: 0 8px 8px 0;">
        <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #92400e;">
          {intervention_title}
        </p>
        <p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.5;">
          {message_body}
        </p>
      </div>
      <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 16px 0 0;">
        Log in to your dashboard to review and acknowledge this intervention.
      </p>
    </div>
    <div style="background: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0;">
      <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
        This is an automated message from the Maranatha Academic Risk Detection System.
      </p>
    </div>
  </div>
</body>
</html>"""
    return subject, html


def send_intervention_email(to_email: str, student_name: str,
                             intervention_title: str, message_body: str) -> dict:
    """Send an intervention notification email to a student."""
    settings = get_settings()
    subject, html = _build_intervention_email(student_name, intervention_title, message_body)

    if settings.debug:
        log.info("[DEV] Intervention email to %s: %s", to_email, intervention_title)
        return {"sent": False, "dev_mode": True}

    if not settings.smtp_host or not settings.smtp_user:
        log.warning("SMTP not configured — intervention email for %s skipped", to_email)
        return {"sent": False, "dev_mode": True}

    return _send_smtp(to_email, subject, html)


def _risk_color(level: str) -> str:
    return {"High": "#dc2626", "Medium": "#d97706", "Low": "#16a34a"}.get(level, "#64748b")


def _build_weekly_progress_email(student_name: str, data: dict) -> tuple[str, str]:
    """Return (subject, html_body) for a weekly progress digest."""
    risk_level = data.get("risk_level", "Low")
    color = _risk_color(risk_level)
    factors_html = ""
    for f in data.get("top_factors", [])[:3]:
        factors_html += f'<li style="color: #475569; font-size: 13px; margin: 4px 0;">{f}</li>'
    if not factors_html:
        factors_html = '<li style="color: #475569; font-size: 13px;">No risk factors detected</li>'
    recommendation = data.get("recommendation", "Keep up the good work!")

    subject = "Maranatha — Your Weekly Academic Progress"
    html = f"""\
<html>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; padding: 40px 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px;
              box-shadow: 0 2px 12px rgba(0,0,0,.08); overflow: hidden;">
    <div style="background: #0a1628; padding: 28px 32px;">
      <h1 style="color: #d4a843; margin: 0; font-size: 20px;">Maranatha University</h1>
      <p style="color: rgba(255,255,255,.7); margin: 6px 0 0; font-size: 13px;">
        Weekly Progress Report
      </p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px;">
        Hello <strong>{student_name}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        Here is your weekly academic progress summary:
      </p>
      <div style="text-align: center; margin: 0 0 20px;">
        <span style="display: inline-block; background: {color}; color: #fff;
                     padding: 8px 24px; border-radius: 20px; font-size: 14px;
                     font-weight: 600; letter-spacing: 0.5px;">
          Risk Level: {risk_level}
        </span>
      </div>
      <p style="color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 6px;">
        Top Contributing Factors:
      </p>
      <ul style="margin: 0 0 16px; padding-left: 20px;">{factors_html}</ul>
      <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px;
                  border-radius: 0 8px 8px 0; margin: 0 0 16px;">
        <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.5;">
          <strong>Recommendation:</strong> {recommendation}
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        Log in to your dashboard for detailed insights and personalised support.
      </p>
    </div>
    <div style="background: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0;">
      <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
        This is an automated weekly digest from Maranatha Academic Risk Detection System.
      </p>
    </div>
  </div>
</body>
</html>"""
    return subject, html


def send_weekly_progress_email(to_email: str, student_name: str, progress_data: dict) -> dict:
    """Send a weekly progress digest email to a student."""
    settings = get_settings()
    subject, html = _build_weekly_progress_email(student_name, progress_data)

    if settings.debug:
        log.info("[DEV] Weekly progress email to %s: risk=%s", to_email, progress_data.get("risk_level"))
        return {"sent": False, "dev_mode": True}

    if not settings.smtp_host or not settings.smtp_user:
        log.warning("SMTP not configured — weekly progress email for %s skipped", to_email)
        return {"sent": False, "dev_mode": True}

    return _send_smtp(to_email, subject, html)


def _build_risk_change_email(student_name: str, old_level: str, new_level: str,
                              top_factors: list) -> tuple[str, str]:
    """Return (subject, html_body) for a risk level change notification."""
    color = _risk_color(new_level)
    direction = "improved" if new_level == "Low" or (new_level == "Medium" and old_level == "High") else "changed"
    factors_html = ""
    for f in (top_factors or [])[:3]:
        factors_html += f'<li style="color: #475569; font-size: 13px; margin: 4px 0;">{f}</li>'

    subject = "Maranatha — Your Risk Level Has Changed"
    html = f"""\
<html>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; padding: 40px 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px;
              box-shadow: 0 2px 12px rgba(0,0,0,.08); overflow: hidden;">
    <div style="background: #0a1628; padding: 28px 32px;">
      <h1 style="color: #d4a843; margin: 0; font-size: 20px;">Maranatha University</h1>
      <p style="color: rgba(255,255,255,.7); margin: 6px 0 0; font-size: 13px;">
        Risk Level Update
      </p>
    </div>
    <div style="padding: 32px;">
      <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px;">
        Hello <strong>{student_name}</strong>,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        Your academic risk level has {direction}:
      </p>
      <div style="text-align: center; margin: 0 0 20px;">
        <span style="display: inline-block; background: #f1f5f9; color: #64748b;
                     padding: 6px 16px; border-radius: 16px; font-size: 13px;
                     text-decoration: line-through;">{old_level}</span>
        <span style="color: #94a3b8; margin: 0 8px;">&rarr;</span>
        <span style="display: inline-block; background: {color}; color: #fff;
                     padding: 6px 16px; border-radius: 16px; font-size: 13px;
                     font-weight: 600;">{new_level}</span>
      </div>
      {"<p style='color: #1e293b; font-size: 13px; font-weight: 600; margin: 0 0 6px;'>Key factors:</p><ul style='margin: 0 0 16px; padding-left: 20px;'>" + factors_html + "</ul>" if factors_html else ""}
      <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 0;">
        Log in to your dashboard for personalised recommendations and support resources.
      </p>
    </div>
    <div style="background: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0;">
      <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
        This is an automated notification from Maranatha Academic Risk Detection System.
      </p>
    </div>
  </div>
</body>
</html>"""
    return subject, html


def send_risk_change_email(to_email: str, student_name: str, old_level: str,
                            new_level: str, top_factors: list) -> dict:
    """Send a risk level change notification email to a student."""
    settings = get_settings()
    subject, html = _build_risk_change_email(student_name, old_level, new_level, top_factors)

    if settings.debug:
        log.info("[DEV] Risk change email to %s: %s -> %s", to_email, old_level, new_level)
        return {"sent": False, "dev_mode": True}

    if not settings.smtp_host or not settings.smtp_user:
        log.warning("SMTP not configured — risk change email for %s skipped", to_email)
        return {"sent": False, "dev_mode": True}

    return _send_smtp(to_email, subject, html)


# ---------------------------------------------------------------------------
# Admin Weekly Digest Email
# ---------------------------------------------------------------------------

def _build_admin_digest_email(data: dict) -> tuple:
    """Build HTML for admin weekly digest."""
    subject = "Maranatha — Weekly Admin Digest"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#0f1f3d;">Weekly Admin Digest</h2>
      <p style="color:#64748b;">Here is your institution-wide summary for this week.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr>
          <td style="padding:12px;border:1px solid #e2e8f0;"><strong>High Risk Students</strong></td>
          <td style="padding:12px;border:1px solid #e2e8f0;color:#ef4444;font-weight:bold;">{data.get('high_risk_count', 0)}</td>
        </tr>
        <tr>
          <td style="padding:12px;border:1px solid #e2e8f0;"><strong>Open SOS Alerts</strong></td>
          <td style="padding:12px;border:1px solid #e2e8f0;color:#f59e0b;font-weight:bold;">{data.get('open_sos_count', 0)}</td>
        </tr>
        <tr>
          <td style="padding:12px;border:1px solid #e2e8f0;"><strong>Escalated Interventions</strong></td>
          <td style="padding:12px;border:1px solid #e2e8f0;">{data.get('escalated_interventions', 0)}</td>
        </tr>
        <tr>
          <td style="padding:12px;border:1px solid #e2e8f0;"><strong>Total Active Students</strong></td>
          <td style="padding:12px;border:1px solid #e2e8f0;">{data.get('total_students', 0)}</td>
        </tr>
      </table>
      <p style="color:#94a3b8;font-size:12px;">Maranatha Academic Risk Detection System</p>
    </div>
    """
    return subject, html


def send_admin_weekly_digest(to_email: str, data: dict):
    """Send admin weekly digest email."""
    subject, html = _build_admin_digest_email(data)
    log.info("Admin digest -> %s | High Risk: %s, SOS: %s", to_email, data.get("high_risk_count"), data.get("open_sos_count"))

    if settings.debug:
        return {"sent": False, "dev_mode": True}

    if not settings.smtp_host or not settings.smtp_user:
        log.warning("SMTP not configured — admin digest email for %s skipped", to_email)
        return {"sent": False, "dev_mode": True}

    return _send_smtp(to_email, subject, html)
