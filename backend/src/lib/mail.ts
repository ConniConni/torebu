import sgMail from '@sendgrid/mail'

const apiKey = process.env.SENDGRID_API_KEY
const fromAddress = process.env.MAIL_FROM_ADDRESS

if (apiKey) {
  sgMail.setApiKey(apiKey)
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  // SendGridアカウント未設定のローカル開発でも動作確認できるよう、未設定時は送信をスキップし
  // リセットURLをログに出す（docs/backlog.md「メール送信基盤の方針」参照）
  if (!apiKey || !fromAddress) {
    console.log(`[mail] SENDGRID_API_KEY/MAIL_FROM_ADDRESS未設定のため送信をスキップしました。`)
    console.log(`[mail] パスワード再設定URL: ${resetUrl}`)
    return
  }

  await sgMail.send({
    to,
    from: fromAddress,
    subject: '【トレ部】パスワード再設定のご案内',
    text: `パスワードの再設定を受け付けました。以下のリンクから新しいパスワードを設定してください（有効期限:1時間）。\n\n${resetUrl}\n\n心当たりが無い場合はこのメールを破棄してください。`,
  })
}
