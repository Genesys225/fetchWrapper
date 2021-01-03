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
				const attName =
					(attObj.name === 'id' ? '-' : '_') + attObj.name;
				if (!json[currentTagName]) json[currentTagName] = {};
				else if (json[currentTagName] instanceof Array) {
					const currentIndex =
						json[currentTagName].length >= 1
							? json[currentTagName].length - 1
							: 0;
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
							/** */
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

class XmlNode {
	constructor(json, parentNode) {
		this.json = json;
		this.keys = Object.keys(json);
		this._name = this.keys[0];
		this._attributes = {};
		this.parentNode = parentNode;
		this._attrLength = 0;
		this.currentIndex = 0;
		this.xmlDoc = parentNode.xmlDoc;
		this.element =
			this.xmlDoc.createElement &&
			this.xmlDoc.createElement(
				/^\d*$/.test(this._name) ? this.parentNode.tagName : this._name
			);
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

	static logTreeStructure(root) {
		let treeStructure = '';
		function traverse(node, indent = 0) {
			treeStructure += `${'--'.repeat(indent)}${node.getNodeName()}\n`;
			indent++;
			for (let i = 0, length = node.noOfChildren(); i < length; i++) {
				traverse(node.getChildByIndex(i), indent);
			}
		}

		traverse(root);
		return treeStructure;
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
		this._type = 'Composite Node';
	}

	get type() {
		return this._type;
	}

	appendChild(xmlNode) {
		this.element.appendChild(xmlNode);
	}
}

class RootXml extends Composite {
	constructor(json) {
		super(json, { xmlDoc: {} });
		this._type = 'Root Node';
		this._children = [];
		this._attributes = [];
		this.xmlDoc = new DOMParser().parseFromString(
			`<?xml version="1.0" encoding="utf-8"?><root-replace></root-replace>`,
			'application/xml'
		);
		delete this._parent;
	}

	appendChild(xmlNode) {
		this.xmlDoc.replaceChild(this.xmlDoc.children[0], xmlNode);
	}
}

class Json2 {
	constructor(json) {
		this.json = json;
		this.rootNode = new RootXml(this.json);
		this.xmlDoc = rootNode.xmlDoc;
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
		const result = this.rootNode.keys.reduce(
			recursivelyParseJson,
			this.rootNode
		);
		function recursivelyParseJson(xmlNode, key) {
			if (inst.isTag(key)) {
				let xmlElem = new Composite(xmlNode.json[key], xmlNode);
				if (typeof xmlNode.json[key] === 'string') {
					xmlElem = new Leaf(xmlNode.json, xmlNode);
				} else if (typeof inst.currentDepth === 'object') {
					let currentDepth = xmlNode.json[key];
					if (xmlNode.json instanceof Array) {
						currentDepth = xmlNode.json[xmlNode.currentIndex];
						xmlNode.currentIndex++;
					}
					xmlElem = Object.keys(currentDepth).reduce(
						recursivelyParseJson,
						xmlElem
					);
				}
				xmlNode.appendChild(xmlElem);
			} else if (inst.isAttribute(key)) {
				xmlNode.setAttribute(
					key.replace(/^(_|-)/, ''),
					xmlNode.json[key]
				);
			} else if (key === '#text') {
				xmlNode.textContent = xmlNode.json[key];
			} else throw new Error('outer????????????');
		}
	}
}
