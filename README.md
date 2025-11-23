# cloudflare-reverse-proxy

Cloudflare Workers as a Reverse Proxy!
Heavily inspired by [cloudflare-cors-anywhere](https://github.com/Zibri/cloudflare-cors-anywhere.git)

&copy; 2025 lunaiz. Co., Ltd. (https://lunaiz.com)

## Introduction

This Cloudflare Workers script acts as a reverse proxy server, forwarding incoming HTTP requests to a specified target server and returning the responses back to the clients.

It is designed to handle various HTTP methods, manage headers, and support CORS.
It can be customized to include additional features such as logging, authentication, and caching as needed.

---

```
Cloudflare Workers as a Reverse Proxy!
(c) 2025 lunaiz. Co., Ltd. (https://lunaiz.com)

Source:
https://github.com/lunaiz-corp/cloudflare-reverse-proxy.git

Usage:
https://{YOUR_WORKERS_URL}/?url={uri}
* Header origin or x-requested-with must be set by the client.
* Target URL must be URL-encoded fully (Example: 'url=https%253A%252F%252Fexample.com%252F%253Ftest').
* Forbidden headers such as Cookies should be set via "X-Custom-Headers" header as a JSON object string.

Donate:
https://github.com/sponsors/lunaiz-corp
```

## Deployment

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lunaiz-corp/cloudflare-reverse-proxy.git)

This project is written in [Cloudfalre Workers](https://workers.cloudflare.com/), and can be easily deployed with [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

```bash
wrangler publish
```

## Usage Example

> [!TIP]
> All received headers are also returned in "x-received-headers" header.

```js
fetch('https://{YOUR_WORKERS_URL}/?url=https://httpbin.org/post', {
	method: 'post',
	headers: {
		'x-foo': 'bar',
		'x-bar': 'foo',
		'x-custom-headers': JSON.stringify({
			// allows to send forbidden headers
			// https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name
			cookies: 'x=123',
		}),
	},
})
	.then((res) => {
		// allows to read all headers (even forbidden headers like set-cookies)
		const headers = JSON.parse(res.headers.get('x-received-headers'));
		console.log(headers);
		return res.json();
	})
	.then(console.log);
```
