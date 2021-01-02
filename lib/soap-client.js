const { FetchWrap } = require('./fetchWrapper');
const { DOMParser } = require('xmldom');

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
			const currentTagName = element.tagName;
			const attrLength = element.attributes
				? element.attributes.length
				: 0;
			if (element.childNodes && element.childNodes.length > 0) {
				const nestedDOM = Array.from(element.childNodes).reduce(
					recursivelyParseDom,
					{}
				);
				if (json[currentTagName] && json[currentTagName].length > 0) {
					json[currentTagName].push(nestedDOM);
				} else if (json[currentTagName]) {
					json[currentTagName] = [json[currentTagName], nestedDOM];
				} else json[currentTagName] = nestedDOM;
			}
			for (let attrCount = 0; attrCount <= attrLength - 1; attrCount++) {
				const attObj = element.attributes[attrCount];
				if (!json[currentTagName]) json[currentTagName] = {};
				else if (json[currentTagName] instanceof Array) {
					const currentIndex =
						json[currentTagName].length >= 1
							? json[currentTagName].length - 1
							: 0;
					const attName =
						(attObj.name === 'id' ? '-' : '_') + attObj.name;
					json[currentTagName][currentIndex][attName] = attObj.value;
				} else {
					json[currentTagName][attName] = attObj.value;
				}
			}
			const childText =
				element.childNodes &&
				Array.from(element.childNodes).find(
					(child) => child.nodeType === child.TEXT_NODE
				);
			if (childText && childText.textContent.trim()) {
				if (!json[currentTagName])
					json[currentTagName] = childText.textContent;
				else json[currentTagName]['#text'] = childText.textContent;
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
			body: xmlDoc.children[0].outerHTML,
		});
	}
}

module.exports = { SOAPClient };

class JsonToXML {
	constructor(json) {
		this.json = json;
		this.keys = Object.keys(json);
		this.xmlDoc = new DOMParser().parseFromString(
			`<?xml version="1.0" encoding="utf-8"?><root-replace></root-replace>`,
			'application/xml'
		);
		this.currentDepth = json;
		this.arrIndex = 0;
		this.arrayWrappers = [];
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
		const result = this.keys.reduce(
			recursivelyParseJson,
			this.xmlDoc.children[0]
		);
		function recursivelyParseJson(xmlNode, key) {
			if (inst.isTag(key)) {
				let xmlElem = inst.xmlDoc.createElement(
					/^\d*$/.test(key) ? xmlNode.tagName : key
				);
				if (typeof inst.currentDepth[key] === 'string') {
					xmlElem.textContent = inst.currentDepth[key];
				} else if (typeof inst.currentDepth === 'object') {
					const temp = inst.currentDepth;
					if (inst.currentDepth instanceof Array) {
						if (inst.arrIndex >= inst.currentDepth.length)
							inst.arrIndex = 0;
						inst.currentDepth = inst.currentDepth[inst.arrIndex];
						inst.arrIndex++;
						if (typeof inst.currentDepth === 'string')
							inst.currentDepth = { '#text': inst.currentDepth };
					} else inst.currentDepth = inst.currentDepth[key];
					xmlElem = Object.keys(inst.currentDepth).reduce(
						recursivelyParseJson,
						xmlElem
					);
					inst.currentDepth = temp;
				} else throw new Error('inner??????');
				if (xmlNode.tagName === 'root-replace')
					inst.xmlDoc.replaceChild(xmlElem, xmlNode);
				else if (
					inst.currentDepth instanceof Array &&
					inst.arrIndex === 1
				) {
					inst.arrayWrappers.push(xmlElem);
				} else xmlNode.appendChild(xmlElem);
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
		inst.cleanUpArrWraps(inst.arrayWrappers);
		return result;
	}
	cleanUpArrWraps(wrappersArr) {
		wrappersArr.forEach((arrWrapper) => {
			Array.from(arrWrapper.childNodes).forEach((element) => {
				arrWrapper.parentNode.insertBefore(element, arrWrapper);
			});
			arrWrapper.parentNode.removeChild(arrWrapper);
		});
	}
}
