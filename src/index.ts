/**
 * Cloudflare Workers as a Reverse Proxy!
 * Heavily inspired by cloudflare-cors-anywhere (https://github.com/Zibri/cloudflare-cors-anywhere.git)
 *
 * (c) 2025 lunaiz. Co., Ltd. (https://lunaiz.com)
 * Email: cso@lunaiz.com
 *
 * https://github.com/lunaiz-corp/cloudflare-reverse-proxy.git
 * License: MIT
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 *
 * This Cloudflare Workers script acts as a reverse proxy server, forwarding incoming HTTP requests
 * to a specified target server and returning the responses back to the clients.
 *
 * It is designed to handle various HTTP methods, manage headers, and support CORS.
 * It can be customized to include additional features such as logging, authentication, and caching as needed.
 *
 * ----------------------------
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see this worker in action
 * - Run `npm run deploy` to publish
 *
 * You can bind Cloudflare resources to this worker in `wrangler.jsonc`.
 * After adding bindings, a type definition for the `Env` object can be regenerated with `npm run cf-typegen`.
 */

type DomainsEnv = Cloudflare.Env & {
	WHITELISTED_DOMAINS?: string[];
	BLACKLISTED_DOMAINS?: string[];
};

//#region Whitelists or Blacklists
/**
 * You can configure whitelist or blacklist in `environment variables`.
 * If both are configured, blacklist takes precedence.
 *
 * For example, you can set the following environment variables in `wrangler.jsonc`:
 * "env": {
	"WHITELISTED_DOMAINS": ["example.com", "anotherdomain.com"],
	"BLACKLISTED_DOMAINS": ["baddomain.com", "maliciousite.org"],
 * }
 */
function isAllowedTarget(url: URL, env: DomainsEnv): boolean {
	if (env.BLACKLISTED_DOMAINS?.includes(url.hostname)) {
		return false;
	}

	if (env.WHITELISTED_DOMAINS?.includes(url.hostname) === false) {
		return false;
	}

	return true;
}
//#endregion

//#region Modify headers to enable CORS
function setupCORSHeaders(request: Request, headers: Headers): Headers {
	const originUrl = new URL(request.url);
	const isPreflightRequest = request.method === 'OPTIONS';

	headers.set('Access-Control-Allow-Origin', request.headers.get('Origin') || originUrl.origin);

	if (isPreflightRequest) {
		headers.set('Access-Control-Allow-Methods', request.headers.get('access-control-request-method') || 'GET, POST, PUT, DELETE, OPTIONS');

		const requestedHeaders = request.headers.get('access-control-request-headers');
		if (requestedHeaders) {
			headers.set('Access-Control-Allow-Headers', requestedHeaders);
		}

		headers.delete('X-Content-Type-Options');
	}

	return headers;
}
//#endregion

//#region Event listeners
export default {
	async fetch(request, env, ctx): Promise<Response> {
		const originUrl = new URL(request.url);
		const baseResponse =
			'Cloudflare Workers as a Reverse Proxy!\n' +
			'(c) 2025 lunaiz. Co., Ltd. (https://lunaiz.com)\n\n' +
			'Source:\nhttps://github.com/lunaiz-corp/cloudflare-reverse-proxy.git\n\n' +
			`Usage:\n${originUrl.origin}/?url={uri}\n` +
			'* Header origin or x-requested-with must be set by the client.\n' +
			"* Target URL must be URL-encoded fully (Example: 'url=https%253A%252F%252Fexample.com%252F%253Ftest').\n" +
			'* Forbidden headers such as Cookies should be set via "X-Custom-Headers" header as a JSON object string.\n\n' +
			'Donate:\nhttps://github.com/sponsors/lunaiz-corp\n\n' +
			'----------------------------\n\n';

		const originHeader = request.headers.get('Origin');
		const connectingIp = request.headers.get('CF-Connecting-IP');

		// Get target URL from query parameter
		// Example: ?url=https://example.com/api (url should be URL-encoded)
		const targetUrlParam = originUrl.searchParams.get('url');
		if (!targetUrlParam) {
			return new Response(
				baseResponse +
					'Connecting Info:\n' +
					`* Origin: ${originHeader || 'Unknown'}\n` +
					`* IP: ${connectingIp || 'Unknown'}\n` +
					`* Country: ${request.cf?.country || 'Unknown'}\n` +
					`* Data Centre: ${request.cf?.colo || 'Unknown'}\n` +
					`* X-Custom-Headers: ${request.headers.get('X-Custom-Headers') || 'None'}`,
				{ status: 200, statusText: 'OK' }
			);
		}

		// Check if there's multiple searchParams provided (means URL is not fully URL-encoded)
		if (originUrl.searchParams.size > 1) {
			return new Response(
				baseResponse + '** Error: Multiple query parameters detected. Please ensure the target URL is fully URL-encoded.',
				{
					status: 400,
					statusText: 'Bad Request',
				}
			);
		}

		// Decode and validate the target URL
		let targetUrl: URL;
		try {
			targetUrl = new URL(decodeURIComponent(targetUrlParam));
		} catch {
			return new Response(baseResponse + '** Error: Invalid target URL. Please ensure the target URL is fully URL-encoded.', {
				status: 400,
				statusText: 'Bad Request',
			});
		}

		// Check if the target URL is allowed
		if (!isAllowedTarget(targetUrl, env)) {
			return new Response(
				baseResponse +
					'** Error: Target URL is not allowed by administrator. If this issue persists, please contact administrator for assistance.',
				{ status: 403, statusText: 'Forbidden' }
			);
		}

		// Parse custom headers from "X-Custom-Headers" header
		let customHeaders = request.headers.get('X-Custom-Headers');
		if (customHeaders !== null) {
			try {
				customHeaders = JSON.parse(customHeaders);
			} catch {} // it's okay
		}

		// Filter out headers that should not be forwarded
		const filteredHeaders: { [key: string]: string } = {};
		for (const [key, value] of request.headers.entries()) {
			if (
				key.match('^origin') === null &&
				key.match('eferer') === null &&
				key.match('^cf-') === null &&
				key.match('^x-forw') === null &&
				key.match('^x-custom-headers') === null
			) {
				filteredHeaders[key] = value;
			}
		}

		// Add custom headers to the request
		if (customHeaders !== null) {
			for (const [key, value] of Object.entries(customHeaders)) {
				filteredHeaders[key] = value;
			}
		}

		// Send request to the target URL
		const newRequest = new Request(request, {
			redirect: 'follow',
			headers: filteredHeaders,
		});

		// Modify response headers to enable CORS
		const response = await fetch(targetUrl, newRequest);
		const responseHeaders = setupCORSHeaders(request, new Headers(response.headers));

		// Expose all response headers to the client
		const exposedHeaders: string[] = [];
		const allResponseHeaders: Record<string, string> = {};
		for (const [key, value] of response.headers.entries()) {
			exposedHeaders.push(key);
			allResponseHeaders[key] = value;
		}

		exposedHeaders.push('x-received-headers');
		responseHeaders.set('x-received-headers', JSON.stringify(allResponseHeaders));
		responseHeaders.set('Access-Control-Expose-Headers', exposedHeaders.join(','));

		// Give response to the client
		const isPreflightRequest = request.method === 'OPTIONS';
		const responseBody = isPreflightRequest ? null : await response.arrayBuffer();

		const responseInit = {
			headers: responseHeaders,
			status: isPreflightRequest ? 200 : response.status,
			statusText: isPreflightRequest ? 'OK' : response.statusText,
		};

		return new Response(responseBody, responseInit);
	},
} satisfies ExportedHandler<Env>;
//#endregion
