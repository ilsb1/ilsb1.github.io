export function mailIsConfigured(env) {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

export async function sendLoginCode({ env, email, code, fetchImpl = fetch }) {
  if (!env.RESEND_API_KEY) return "preview";
  if (!env.MAIL_FROM) {
    const error = new Error("mail_not_configured");
    error.status = 503;
    error.code = "mail_not_configured";
    throw error;
  }
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [email],
      subject: "Your writing desk code",
      text: [
        `Your sign-in code is ${pretty}`,
        "",
        "It expires in 10 minutes. If you did not ask for this, you can ignore this email.",
        "",
      ].join("\n"),
    }),
  });
  if (!response.ok) {
    const error = new Error("mail_failed");
    error.status = 502;
    error.code = "mail_failed";
    throw error;
  }
  return "email";
}
