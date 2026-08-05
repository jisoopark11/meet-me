type SendArgs = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

export async function sendMail({ to, subject, html, replyTo }: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY / MAIL_FROM 환경변수가 없습니다.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) throw new Error(`메일 발송 실패 (${res.status}): ${await res.text()}`);
}

/** 사용자 입력을 메일 HTML에 넣기 전 반드시 통과시킬 것 */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e7e5e4;">
    <h1 style="margin:0 0 20px;font-size:18px;color:#1c1917;">${esc(title)}</h1>
    ${bodyHtml}
  </div>
</body></html>`;
}

export function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 16px 8px 0;color:#78716c;font-size:14px;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="padding:8px 0;color:#1c1917;font-size:14px;">${esc(value)}</td>
  </tr>`;
}
