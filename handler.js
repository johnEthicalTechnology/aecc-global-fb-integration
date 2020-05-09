'use strict';
const FormData = require('form-data')
const axios = require('axios')
const AWS = require('aws-sdk')
const s3 = new AWS.S3({apiVersion: '2014-11-06'})
const parameterStore = new AWS.SSM({apiVersion: '2014-11-06'})

AWS.config.update({
  region: 'ap-southeast-2'
})

const getParam = param => {
  return new Promise((res, rej) => {
    parameterStore.getParameter({
      Name: param
    }, (err, data) => {
        if (err) {
          return rej(err)
        }
        return res(data)
    })
  })
}

const pagesDetails = [
  {
    pageId: '266317873423703',
    longLivedAccessToken: process.env.GLOBAL_PAGE_ACCESS_TOKEN
  },
  {
    pageId: '1598122583737725',
    longLivedAccessToken: process.env.INDIA_PAGE_ACCESS_TOKEN
  },
  {
    pageId: '385316278330827',
    longLivedAccessToken: process.env.NEAPL_PAGE_ACCESS_TOKEN
  },
  {
    pageId: '506440762708909',
    longLivedAccessToken: process.env.GREECE_PAGE_ACCESS_TOKEN
  },
  {
    pageId: '1636950326523616',
    longLivedAccessToken: process.env.PHILIPPINES_PAGE_ACCESS_TOKEN
  },
  {
    pageId: '1859665277685394',
    longLivedAccessToken: process.env.THAILAND_PAGE_ACCESS_TOKEN
  },
  {
    pageId: '713778565488189',
    longLivedAccessToken: process.env.INDONESIA_PAGE_ACCESS_TOKEN
  },
  {
    pageId: '1916814848599036',
    longLivedAccessToken: process.env.MALAYSIA_PAGE_ACCESS_TOKEN
  },
  {
    pageId: '314193669023890',
    longLivedAccessToken: process.env.SINGAPORE_PAGE_ACCESS_TOKEN
  },
  {
    pageId: '444444444444',
    longLivedAccessToken: 'testhingtoken'
  }
]

const bizSdk = require('facebook-nodejs-business-sdk');
const Lead = bizSdk.Lead;

const ZOHO_API_ENQUIRES = 'https://www.zohoapis.com/crm/v2/functions/facebookleadflow/actions/execute?auth_type=apikey&zapikey=1003.84fb08f0ab6ea57846f1a94aa28a62ed.d93fe2b5d709deb3e2ed25902703b108'

module.exports.fbLeadflow = async event => {
  //! SETUP - to be deleted afterwards
  //* 1) Setup the app that I'll be creating with the FB identity that Jake gives me, follow the tutorial I followed yesterday and setup the subscription going through the login process, etc
  //* 2) Get a long lived user access token so I can get an eternal page access token and add them to the env
  //! INTEGRATION
  //* 3) Get the leads from the array that is sent to the lambda by parsing JSON and then extracting
  // Convert to JS object
  const webhookLeadgenObject = JSON.parse(event.body)
  const leadgenChanges = webhookLeadgenObject.entry[0].changes
  console.log('Converted to JS object', leadgenChanges)

  // Get appropriate page access token
  const pageIdSearchingFor = leadgenChanges[0].value.page_id
  const elementPos = pagesDetails.map((pageObject) => pageObject.pageId ).indexOf(pageIdSearchingFor)
  const foundPageObject = pagesDetails[elementPos]
  console.log('Found appropriate object with page access token', foundPageObject)

  // Initialise API with Page Access Token
  const api = bizSdk.FacebookAdsApi.init(foundPageObject.longLivedAccessToken)
  console.log('Api initialised', api);

  // ! DELETE THIS WHEN FINISHED
  // Setting this to true shows more debugging info.
  const showDebugingInfo = true
  if (showDebugingInfo) {
    api.setDebug(true)
  }
  //* Use Parameter store in System Manager to get current day
  const currentDayString = await parameterStore.getParameter({
    Name: CurrentDay
  }).promise()
  const currentDayDate = new Date(currentDayString)
  //* Test if it's the same month and same day if so use the param store value as folder if not update param store and use the updated date

  let fields, params
  fields = []
  params = {}
  const ONLY_ONE_LEAD_GEN = 1
  if (leadgenChanges.length === ONLY_ONE_LEAD_GEN) {
    // const leadgenId = leadgenChanges[0].value.leadgen_id
    // const leadData = await (new Lead(leadgenId)).get(fields, params)
    // console.log('Got Lead Data', leadData)
    // const parsedLeadData = JSON.parse(leadData)
    // const leadgenData = parsedLeadData.field_data.reduce((leadgenDataObject, leadgenField) => {
    //   return Object.assign(leadgenDataObject, {
    //     [`${leadgenField.name}`]: `${leadgenField.values[0]}`
    //   })
    // }, {})
    const testData = JSON.stringify({
      email: 'test@email.com',
      first_name: 'test',
      last_name: 'user',
      phone_number: 444123987
    })
    // I have to consider when the Lambda isn't running how I can put files for the day into the same folder?
    // I can store a JSON in the bucket to act as a kind of keeper of time. If a new day then change it to that date.
    const timeStamp = Date.now()
    const params = {
    Body: testData,
    Bucket: 'facebook-leadflow',
    Key: `${currentDate}/${timeStamp}.json`
  }
    // send to Zoho and S3 bucket here
    const formData = new FormData()
    formData.append('leadData', testData)
    const transformedData = {
      body: formData,
      config: {
        headers: formData.getHeaders(),
    },
    };
    try {
      const zohoRes = await axios({
        method: 'post',
        url: ZOHO_API_ENQUIRES,
        data: transformedData.body,
        ...transformedData.config
      })
      console.log('Res from Zoho', zohoRes)
    } catch (error) {
      console.error(error)
    }



  } else {

  }

  // let message;

  // try {
  //   message = await s3.putObject(params).promise();
  // } catch (error) {
  //   message = error;
  //   console.log('ERROR', error);
  // }
  // console.log('testing log', event, event.queryStringParameters['hub.challenge']);

  console.log('event', event);
  console.log('event', event.body.entry);


  return {
        statusCode: 200
      };
};