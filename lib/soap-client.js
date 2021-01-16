const { FetchWrap } = require('./fetchWrapper');
const { DOMParser, XMLSerializer } = require('xmldom');

class SOAPClient extends FetchWrap {
	constructor(...args) {
		super(...args);
		this.Json2Xml = JsonToXML;
		this.serializer = new XMLSerializer();
	}

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
			if (element.nodeType === 1) {
				let nestedDOM = {};
				if (element.childNodes && element.childNodes.length > 0) {
					nestedDOM = Array.from(element.childNodes).reduce(
						recursivelyParseDom,
						{}
					);
				}
				if (json[currentTagName] && json[currentTagName].length > 0) {
					json[currentTagName].push(nestedDOM);
				} else if (json[currentTagName]) {
					json[currentTagName] = [json[currentTagName], nestedDOM];
				} else {
					json[currentTagName] = nestedDOM;
				}
			}
			for (let attrCount = 0; attrCount < attrLength; attrCount++) {
				const attObj = element.attributes[attrCount];
				const attName =
					(attObj.name === 'id' ? '-' : '_') + attObj.name;
				if (!json[currentTagName])
					json[currentTagName] = { [attName]: attObj.value };
				else if (json[currentTagName] instanceof Array) {
					const currentIndex = json[currentTagName].length - 1;
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
			body: this.serializer.serializeToString(xmlDoc),
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
			this.xmlDoc.lastChild
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
					if (key === '1') inst.arrayWrappers.push(xmlNode);
					inst.currentDepth = inst.currentDepth[key];
					if (typeof inst.currentDepth === 'string')
						inst.currentDepth = { '#text': inst.currentDepth };
					xmlElem = Object.keys(inst.currentDepth).reduce(
						recursivelyParseJson,
						xmlElem
					);
					inst.currentDepth = temp;
				} else throw new Error('inner??????');
				if (xmlNode.tagName === 'root-replace')
					inst.xmlDoc.replaceChild(xmlElem, xmlNode);
				else xmlNode.appendChild(xmlElem);
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

class XmlNode {
	constructor(name, parentNode) {
		this.parentNode = parentNode;
		this.json = this.setJson(parentNode.json[name]);
		this.keys = this.json ? Object.keys(this.json) : null;
		this._name = name;
		this._attributes = {};
		this.currentIndex = 0;
		this.xmlDoc = parentNode.xmlDoc;
		this.element =
			this.xmlDoc.createElement &&
			this.xmlDoc.createElement(
				/^\d*$/.test(this._name) ? this.parentNode.tagName : this._name
			);
	}

	setJson(json) {
		if (json instanceof Array) {
			return json[this.parentNode.currentIndex];
		}
		return json;
	}

	get name() {
		return this._name;
	}

	set textContent(text) {
		return (this.element.textContent = text);
	}

	get textContent() {
		return this.element.textContent;
	}

	get attributes() {
		return this._attributes;
	}

	setAttribute(key, value) {
		this.element.setAttribute(key, value);
	}
}

class Leaf extends XmlNode {
	constructor(json, parentNode) {
		super(json, parentNode);
		this._type = 'Leaf Node';
	}

	get type() {
		return this._type;
	}

	noOfChildren() {
		return 0;
	}
}

class Composite extends XmlNode {
	constructor(json, parentNode) {
		super(json, parentNode);
		this._children = [];
		this._type = 'Composite Node';
	}

	get type() {
		return this._type;
	}

	appendChild(xmlNode) {
		this.element.appendChild(xmlNode.element);
		this._children.push(xmlNode);
	}
}

class RootXml extends XmlNode {
	constructor(json) {
		super(Object.keys(json)[0], { xmlDoc: {}, json: {} });
		this.json = json[Object.keys(json)[0]];
		this.keys = Object.keys(this.json);
		this._type = 'Root Node';
		this._children = [];
		this._attributes = [];
		this.xmlDoc = new DOMParser().parseFromString(
			`<?xml version="1.0" encoding="utf-8"?><${this._name}></${this._name}>`,
			'application/xml'
		);
		this.element = this.xmlDoc.documentElement;
		this.parentNode = this.element;
	}

	get type() {
		return this._type;
	}

	setAttribute(key, value) {
		this.element.setAttribute(key, value);
	}

	appendChild(xmlNode) {
		this.element.appendChild(xmlNode.element);
		this._children.push(xmlNode);
	}
}

class Json2Xml {
	constructor(json) {
		this.rootNode = new RootXml(json);
		this.xmlDoc = this.rootNode.xmlDoc;
		this._arrayWrappers = [];
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
		const result = this.rootNode.keys.reduce(
			recursivelyParseJson,
			this.rootNode
		);
		function recursivelyParseJson(xmlNode, key) {
			if (inst.isTag(key)) {
				let xmlElem = new Composite(key, xmlNode);
				if (typeof xmlNode.json[key] === 'string') {
					console.error(xmlNode.json[key]);
					xmlElem.textContent = xmlNode.json[key];
				} else if (typeof xmlNode.json === 'object') {
					let currentDepth = xmlNode.json[key];
					xmlElem = Object.keys(currentDepth).reduce(
						recursivelyParseJson,
						xmlElem
					);
					if (typeof currentDepth === 'string')
						xmlNode.json[key] = { '#text': xmlNode.json[key] };
				}
				xmlElem.appendChild(xmlElem);
			} else if (inst.isAttribute(key)) {
				xmlNode.setAttribute(
					key.replace(/^(_|-)/, ''),
					xmlNode.json[key]
				);
			} else if (key === '#text') {
				xmlNode.textContent = xmlNode.json[key];
			} else throw new Error('outer????????????');
			return xmlNode;
		}
		return result;
	}
}
