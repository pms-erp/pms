// src/lib/email.ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME ?? "Task Manager"}" <${
      process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER
    }>`,
    to,
    subject,
    html,
  });
}

// ─── Template ────────────────────────────────────────────────────────────────

export function buildTaskAssignedEmail({
  assigneeName,
  assignerName,
  taskTitle,
  taskDescription,
  projectName,
  priority,
  taskUrl,
  locationName, // ✅ Added optional location parameter
}: {
  assigneeName: string;
  assignerName: string;
  taskTitle: string;
  taskDescription?: string | null;
  projectName?: string | null;
  priority: string;
  taskUrl: string;
  locationName?: string | null | undefined; // ✅ Added to type
}): { subject: string; html: string } {
  const priorityColors: Record<string, string> = {
    HIGH: "#ef4444",
    MEDIUM: "#f59e0b",
    LOW: "#22c55e",
  };
  const color = priorityColors[priority] ?? "#6b7280";

  return {
    subject: `New Task Assigned: ${taskTitle}`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:#09090b;padding:28px 36px;">
            <p style="margin:0;color:#fff;font-size:18px;font-weight:700;letter-spacing:-.3px;">Task Manager</p>
            <p style="margin:5px 0 0;color:#a1a1aa;font-size:13px;">You have been assigned a new task</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 8px;color:#71717a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Hello, ${assigneeName}</p>
            <p style="margin:0 0 28px;color:#09090b;font-size:15px;line-height:1.6;">
              <strong>${assignerName}</strong> has assigned you a task. Please review the details below.
            </p>

            <!-- Task card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;margin-bottom:28px;">
              <tr>
                <td style="padding:22px 24px;">
                  ${projectName ? `<p style="margin:0 0 6px;color:#71717a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;">📁 ${projectName}</p>` : ""}
                  <p style="margin:0 0 12px;color:#09090b;font-size:17px;font-weight:700;line-height:1.4;">${taskTitle}</p>
                  ${taskDescription ? `<p style="margin:0 0 16px;color:#52525b;font-size:14px;line-height:1.65;">${taskDescription}</p>` : ""}
                  
                  <!-- Badges row: Priority + Location -->
                  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.05em;background:${color}18;color:${color};border:1px solid ${color}40;">
                      ${priority} PRIORITY
                    </span>
                    ${
                      locationName
                        ? `
                      <span style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.03em;background:#3b82f618;color:#3b82f6;border:1px solid #3b82f640;">
                        📍 ${locationName}
                      </span>
                    `
                        : ""
                    }
                  </div>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <a href="${taskUrl}" style="display:inline-block;background:#09090b;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 26px;border-radius:8px;">
              Open Task →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;border-top:1px solid #f4f4f5;">
            <p style="margin:0;color:#a1a1aa;font-size:12px;">This is an automated message from Task Manager. Please do not reply.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
