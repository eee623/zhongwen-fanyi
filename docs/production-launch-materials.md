# Production Launch Materials

Overall status: BLOCKED

| Owner | Env / Material | Status | Why it is required |
| --- | --- | --- | --- |
| Cloud AI | `DASHSCOPE_API_KEY` | configured | Connects the production API to Aliyun LiveTranslate without exposing the key to Chrome. |
| Runtime | `LIVE_TRANSLATE_MODE` | configured | Production must use the real Aliyun path, not the mock translation service. |
| Auth | `CLIENT_TOKEN_SECRET` | invalid | Signs short-lived browser WebSocket credentials after user login. |
| Billing | `BILLING_STORE_FILE` | missing | Persists subscription minutes and session usage across API restarts. |
| Billing | `PAYMENT_LEDGER_FILE` | missing | Persists processed payment IDs for idempotent Alipay and WeChat callbacks. |
| Billing | `PAYMENT_ORDER_STORE_FILE` | missing | Persists pending, paid, canceled, and expired checkout orders. |
| Payments | `PAYMENT_CHECKOUT_BASE_URL` | missing | Creates HTTPS checkout URLs for subscription orders. |
| Payments | `PAYMENT_STATUS_BASE_URL` | missing | Creates signed HTTPS order status links for the popup and checkout site. |
| Payments | `PAYMENT_CHECKOUT_TOKEN_SECRET` | missing | Signs read-only checkout status tokens so order status URLs cannot be forged. |
| Payments | `PAYMENT_VERIFICATION_MODE` | missing | Forces production RSA/RSA2 and WeChat Pay API v3 webhook verification. |
| Payments | `ALIPAY_PUBLIC_KEY_PEM` or `ALIPAY_PUBLIC_KEY_FILE` | missing | Verifies Alipay asynchronous notifications before crediting minutes. |
| Payments | `WECHATPAY_PLATFORM_CERT_SERIAL` | missing | Selects the WeChat Pay platform certificate used to verify callback signatures. |
| Payments | `WECHATPAY_PLATFORM_CERT_PEM` or `WECHATPAY_PLATFORM_CERT_FILE` | missing | Provides the WeChat Pay platform certificate material for API v3 verification. |
| Payments | `WECHATPAY_API_V3_KEY` | missing | Decrypts WeChat Pay API v3 notification resources after signature verification. |

No secret values are printed in this report.
Run `npm run check:production-config` after filling these values.
