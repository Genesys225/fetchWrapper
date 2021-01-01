const fetch = require('node-fetch');
const { Headers } = require('node-fetch');
class FetchWrap {
	constructor (baseUrl = '', baseHeaders = new Headers(), baseParams = {}) {
		this._baseUrl = baseUrl;
		this._baseHeaders = this.parseHeaders(baseHeaders);
		this._baseParams = baseParams;
		this._requestHeaders = new Headers();
	}

	get baseUrl() {
		return this._baseUrl;
	}

	get baseHeaders() {
		const headers = [ ...this._baseHeaders.entries() ];
		return headers.length > 0
			? headers.reduce(
				(headersObj, headerTuple) => ({
					...headersObj,
					[ headerTuple[ 0 ] ]: headerTuple[ 1 ],
				}),
				{}
			)
			: {};
	}

	get baseParams() {
		return this._baseParams;
	}

	setBaseParams(argument) {
		if (typeof argument === 'function')
			this._baseParams = argument(this._baseParams, this._baseUrl);
		else if (typeof argument === 'object') this._baseParams = argument;
		else return false;
		return this;
	}

	setBaseHeaders(argument) {
		const parsedHeaders = this.parseHeaders(argument, this._baseHeaders);
		if (parsedHeaders) {
			this._baseHeaders = parsedHeaders;
			return this;
		} else return false;
	}

	setRequestHeaders(argument) {
		const parsedHeaders = this.parseHeaders(argument, this._requestHeaders);
		if (parsedHeaders) {
			this._requestHeaders = parsedHeaders;
			return this;
		} else return false;
	}

	get(url, getParamsObj = {}) {
		return this.getOrDelete('GET', url, getParamsObj);
	}

	post(url, body, getParamsObj = {}) {
		return this.patchOrPostOpts('POST', url, body, getParamsObj);
	}

	put(url, body, getParamsObj = {}) {
		return this.patchOrPostOpts('PUT', url, body, getParamsObj);
	}

	patch(url, body, getParamsObj = {}) {
		return this.patchOrPostOpts('PATCH', url, body, getParamsObj);
	}

	delete(url, getParamsObj = {}) {
		return this.getOrDelete('DELETE', url, getParamsObj);
	}

	async executeRequest(url, options = null) {
		try {
			const response = options
				? await fetch(url, options)
				: await fetch(url);
			if (!response.ok)
				throw new Error(
					'Something went wrong!\n' +
					JSON.stringify(await response.json())
				);
			return response;
		} catch (error) {
			console.log(error);
		} finally {
			this.setRequestHeaders(new Headers());
		}
	}

	patchOrPostOpts(method, url, body, getParamsObj) {
		const headers = this.mergeHeaders(
			this._baseHeaders,
			this._requestHeaders
		);
		url = this.urlHelper(url, getParamsObj);
		return this.executeRequest({
			method,
			headers,
			body: body,
		});
	}

	getOrDelete(method, url, getParamsObj) {
		const headers = this.mergeHeaders(
			this._baseHeaders,
			this._requestHeaders
		);
		url = this.urlHelper(url, getParamsObj);
		return this.executeRequest(url, {
			method,
			headers,
		});
	}

	urlHelper(url, getParamsObj = {}) {
		url = url.match(/^http/) ? url : this._baseUrl + url;
		const params = { ...this._baseParams, ...getParamsObj };
		const paramsKeys = Object.keys(params);
		if (paramsKeys.length > 0) {
			const paramsQuery = paramsKeys.reduce((paramsQuery, paramKey) => {
				paramsQuery !== '?' && (paramsQuery += '&');
				return (paramsQuery +=
					paramKey + '=' + encodeURIComponent(params[ paramKey ]));
			}, '?');
			return url + paramsQuery;
		}
		return url;
	}

	setAuthToken(token) {
		this.setBaseHeaders((baseHeaders) => {
			if (baseHeaders.get('Authorization'))
				baseHeaders.set('Authorization', token);
			else baseHeaders.append('Authorization', token);
			return baseHeaders;
		});
		return this;
	}

	parseHeaders(argument, currentHeaders = new Headers()) {
		if (typeof argument === 'function')
			return argument(currentHeaders, this._baseUrl);
		else if (typeof argument === 'object')
			if (argument instanceof Headers) return argument;
			else {
				for (let key in argument) {
					currentHeaders.append(
						this.camelCaseToHeaderKey(key),
						argument[ key ]
					);
				}
				return currentHeaders;
			}
		else return false;
	}

	mergeHeaders(headers, moreHeaders, optionalAppend = {}) {
		const mergedHeaders = new Headers(optionalAppend);
		[ ...headers.entries(), ...moreHeaders.entries() ].forEach(
			(keyValueTuple) => {
				if (mergedHeaders.has(keyValueTuple[ 0 ]))
					mergedHeaders.set(keyValueTuple[ 0 ], keyValueTuple[ 1 ]);
				else mergedHeaders.append(keyValueTuple[ 0 ], keyValueTuple[ 1 ]);
			}
		);
		return mergedHeaders;
	}

	camelCaseToHeaderKey(headerKey) {
		if (/^[a-z][A-Za-z]*$/.test(headerKey)) {
			const result = headerKey.replace(/([A-Z])/g, '-$1');
			return result.charAt(0).toUpperCase() + result.slice(1);
		} else return headerKey;
	}
}

module.exports = { FetchWrap };