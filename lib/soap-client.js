const { FetchWrap } = require('./fetchWrapper');
const { DOMParser, DOMImplementation } = require('xmldom');

class SOAPClient extends FetchWrap {
	async executeRequest(...args) {
		return await this.parseXMLDoc(
			await (await super.executeRequest(...args)).text()
		);
	}

	async parseXMLDoc(xmlSting) {
		const parser = new DOMParser();
		const xml = parser.parseFromString(xmlSting, 'text/xml');
		const json = Array.from(xml.childNodes).reduce(recursivelyParseDom, {});
		function recursivelyParseDom(json, element) {
			const currentElemName = element.localName;
			const attrLength = element.attributes
				? element.attributes.length
				: 0;
			if (element.childNodes && element.childNodes.length > 0) {
				const nestedTree = Array.from(element.childNodes).reduce(
					recursivelyParseDom,
					{}
				);
				if (json[currentElemName] && json[currentElemName].length > 0) {
					json[currentElemName].push(nestedTree);
				} else if (json[currentElemName]) {
					json[currentElemName] = [json[currentElemName], nestedTree];
				} else json[currentElemName] = nestedTree;
			}
			for (let attrCount = 0; attrCount <= attrLength - 1; attrCount++) {
				const attObj = element.attributes[attrCount];
				if (!json[currentElemName]) json[currentElemName] = {};
				else if (json[currentElemName] instanceof Array) {
					const currentIndex =
						json[currentElemName].length >= 1
							? json[currentElemName].length - 1
							: 0;
					json[currentElemName][currentIndex][
						(attObj.name === 'id' ? '-' : '_') + attObj.name
					] = attObj.value;
				} else {
					json[currentElemName][
						(attObj.name === 'id' ? '-' : '_') + attObj.name
					] = attObj.value;
				}
			}
			const childText =
				element.childNodes &&
				Array.from(element.childNodes).find(
					(child) => child.nodeType === child.TEXT_NODE
				);
			if (childText && childText.textContent.trim()) {
				if (!json[currentElemName])
					json[currentElemName] = childText.textContent;
				else json[currentElemName]['#text'] = childText.textContent;
			}
			return json;
		}
		return json;
	}

	patchOrPostOpts(method, url, body, getParamsObj) {
		const { xmlDoc } = new JsonToXML(body);
		const headers = this.mergeHeaders(
			this._baseHeaders,
			this._requestHeaders,
			{
				'Content-Type': 'text/xml',
			}
		);
		url = this.urlHelper(url, getParamsObj);
		return super.executeRequest(url, {
			method,
			headers,
			body: xmlDoc.innerHTML,
		});
	}
}

module.exports = { SOAPClient };

class JsonToXML {
	constructor(json) {
		this.json = json;
		this.keys = Object.keys(json);
		this.xmlDoc = DOMImplementation.implementation.createDocument(
			null,
			'soap_doc'
		);
		this.currentDepth = json;
		this.convert();
	}

	isAttribute(key) {
		return /^(-id|_[A-Za-z_]\w*)/.test(key);
	}

	isTag(key) {
		return !/^(#text|-id|_[A-Za-z_]\w*)/.test(key);
	}

	convert() {
		const inst = this;
		const result = this.keys.reduce(rr, this.xmlDoc.children[0]);
		function rr(xmlNode, key) {
			if (inst.isTag(key)) {
				let xmlElem = inst.xmlDoc.createElement(key);
				if (typeof inst.currentDepth[key] === 'string') {
					xmlElem.textContent = inst.currentDepth[key];
				} else if (typeof inst.currentDepth === 'object') {
					const temp = inst.currentDepth;
					inst.currentDepth = inst.currentDepth[key];
					xmlElem = Object.keys(inst.currentDepth).reduce(
						rr,
						xmlElem
					);
					inst.currentDepth = temp;
				} else throw new Error('inner??????');
				xmlNode.appendChild(xmlElem);
			} else if (inst.isAttribute(key)) {
				xmlNode.setAttribute(
					key.replace(/^(_|-)/, ''),
					inst.currentDepth[key]
				);
			} else if (key === '#text') {
				xmlNode.textContent = inst.currentDepth[key];
			} else throw new Error('outer????????????');
			return xmlNode;
		}
		return result;
	}
}
