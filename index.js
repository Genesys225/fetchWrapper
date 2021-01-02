const { SOAPClient } = require('./lib/soap-client');
const { RestClient, rest } = require('./lib/rest-client');
const { FetchWrap } = require('./lib/fetchWrapper');
const fetch = require('node-fetch');
async function run() {
	const res = await new SOAPClient(
		'https://www.crcind.com/csp/samples/SOAP.Demo.CLS'
	).get('?WSDL=1');
	console.log(res.definitions.types['s:schema']['s:element']);
}
run();

module.exports = { FetchWrap, RestClient, SOAPClient, rest };
