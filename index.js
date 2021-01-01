const { SOAPClient } = require('./lib/soap-client');
const { RestClient, rest } = require('./lib/rest-client');
const { FetchWrap } = require('./lib/fetchWrapper');
const fetch = require('node-fetch');
// fetch('https://www.crcind.com/csp/samples/SOAP.Demo.CLS?WSDL=1').then(console.log)
async function run() {
  const res = await new SOAPClient('https://www.crcind.com/csp/samples/SOAP.Demo.CLS').get('?WSDL=1');
  console.log(res.definitions.types.schema.element);
}
run();

module.exports = { FetchWrap, RestClient, SOAPClient, rest };