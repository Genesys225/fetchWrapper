const { SOAPClient } = require('./lib/soap-client');
const { RestClient, rest } = require('./lib/rest-client');
const { FetchWrap } = require('./lib/fetchWrapper');
async function run() {
	const res = new SOAPClient(
		'https://www.crcind.com/csp/samples/SOAP.Demo.CLS'
	);
	const json = await res.get('?WSDL=1');
	const Json2Xml = new res.Json2Xml(json);
	console.log(res.serializer.serializeToString(Json2Xml.xmlDoc));
}
run();

module.exports = { FetchWrap, RestClient, SOAPClient, rest };
