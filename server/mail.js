import nodemailer from "nodemailer";

export function mailIsConfigured(env) {
  return Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
}

function gmailTransport(env) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_USER,
      // Google shows app passwords in groups of four, and people often paste the spaces too.
      pass: env.GMAIL_APP_PASSWORD.replace(/\s+/g, ""),
    },
  });
}

export async function sendLoginCode({ env, email, code, transport }) {
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  const mailer = transport ?? gmailTransport(env);
  try {
    await mailer.sendMail({
      from: { name: "Writing desk", address: env.GMAIL_USER },
      to: email,
      subject: `Your writing desk code: ${pretty}`,
      text: [
        `Your sign-in code is ${pretty}`,
        "",
        "It expires in 10 minutes. If you did not ask for this, you can ignore this email.",
        "",
      ].join("\n"),
      html: [
        '<div style="font-family:Georgia,serif;font-size:17px;color:#1d1b18;line-height:1.5">',
        "<p>Your sign-in code for the writing desk is</p>",
        `<p style="font-size:34px;letter-spacing:6px;font-weight:bold;margin:12px 0">${pretty}</p>`,
        '<p style="color:#6f675c">It expires in 10 minutes. If you did not ask for this, you can ignore this email.</p>',
        "</div>",
      ].join(""),
    });
  } catch (error) {
    console.error("Sign-in email failed", error?.responseCode || error?.code || "error");
    const failed = new Error("mail_failed");
    failed.status = 502;
    failed.code = "mail_failed";
    throw failed;
  }
}
