'use strict';
const crypto = require('crypto')
const FormData = require('form-data')
const axios = require('axios')
const AWS = require('aws-sdk')
const s3 = new AWS.S3({apiVersion: '2006-03-01'})
const ssm = new AWS.SSM({apiVersion: '2014-11-06'})
const bizSdk = require('facebook-nodejs-business-sdk');

AWS.config.update({
  region: 'ap-southeast-2'
})

// TODO Missing Indonesio, Malaysia, and India
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

const Lead = bizSdk.Lead;

const ZOHO_API_ENQUIRES = 'https://www.zohoapis.com/crm/v2/functions/facebookleadflow/actions/execute?auth_type=apikey&zapikey=1003.84fb08f0ab6ea57846f1a94aa28a62ed.d93fe2b5d709deb3e2ed25902703b108'

function sha1Signature(payload) {
  const escapedUnicodePayload = payload.replace(/[\u00A0-\uffff]/gu, function (c) {
    return "\\u" + ("000" + c.charCodeAt().toString(16)).slice(-4)
  })
  const hmac = crypto.createHmac('sha1', process.env.APP_SECRET)
  hmac.update(escapedUnicodePayload)
  return hmac.digest('hex')
}

module.exports.fbLeadflow = async (event, context) => {
  // N.B. - This is to prevent the lambda from running twice which would create unnecessary duplicates
  context.callbackWaitsForEmptyEventLoop = false

  //* 0) Validate payload, reject if not validated
  const lambdaCreatedSha1Signature = sha1Signature(event.body)
  const fbSha1Signature = event.headers['X-Hub-Signature'].slice(5)
  if(fbSha1Signature != lambdaCreatedSha1Signature) {
    return { statusCode: 403 }
  }

  //* 1) Get the new leadgen data from the array sent from the webhook
  const webhookLeadgenObject = JSON.parse(event.body)
  const leadgenChanges = webhookLeadgenObject.entry[0].changes
  console.log('Converted to JS object', leadgenChanges)

  //* 2) Get appropriate page access token
  const pageIdSearchingFor = leadgenChanges[0].value.page_id
  const elementPos = pagesDetails.map((pageObject) => pageObject.pageId ).indexOf(pageIdSearchingFor)
  const foundPageObject = pagesDetails[elementPos]
  console.log('Found page access token', foundPageObject)

  //* 3) Initialise FB API with eternal Page Access Token
  bizSdk.FacebookAdsApi.init(foundPageObject.longLivedAccessToken)

  //* 4) Get appropriate date for the S3 folder storing the current day's Leads
  // N.B Leads to be stored per day in an S3 bucket under the current
  // date which is stored in SSM and updated when the new leads don't match the stored value
  const ssmGetReturnObject = await ssm.getParameter({
    Name: 'DateOfDayForFolderName'
  }).promise()
  const storedDayTimestampString = ssmGetReturnObject.Parameter.Value
  const storedDayTimestampNumber = Number(storedDayTimestampString)
  const storedDayTimestampDate = new Date(storedDayTimestampNumber)
  const storedDayDate = storedDayTimestampDate.getDate()
  const storedDayMonth = storedDayTimestampDate.getMonth()
  const nowTimestamp = Date.now()
  const nowTimestampDate = new Date(nowTimestamp)
  const nowDate = nowTimestampDate.getDate()
  const nowMonth = nowTimestampDate.getMonth()

  let nameOfS3Folder
  // Only using date and month as leads will be coming in frequently
  if(storedDayDate == nowDate && storedDayMonth == nowMonth) {
    nameOfS3Folder = new Date(storedDayTimestampNumber).toUTCString()
    console.log('Using stored date for folder name', nameOfS3Folder)
  } else {
    // N.B. Type is required even though documentation says differently
    const ssmPutReturnObject = await ssm.putParameter({
      Name: 'DateOfDayForFolderName',
      Value: `${nowTimestamp}`,
      Overwrite: true,
      Type: 'String'
    }).promise()
    console.log('Added new timestamp to SSM', ssmPutReturnObject)
    nameOfS3Folder = new Date(nowTimestamp).toUTCString()
    console.log('Using new date for folder name', nameOfS3Folder)
  }

  let fields, params, leadgenId, leadData, parsedLeadData, leadgenData, leadgenJsonTimeStamp, formData, s3Res, s3Params, zohoRes, stringifiedLeadgenData, transformedData, status
  fields = []
  params = {}
  const leadgenChangesLength = leadgenChanges.length
  //* 5) Loop through leadgenChanges to get and parse lead data, store in Zoho and S3 bucket
  for (let index = 0; index < leadgenChangesLength; index++) {
    try {
      //* a) Get Leadgen data for one lead and parse into object
      leadgenId = leadgenChanges[index].value.leadgen_id
      leadData = await (new Lead(leadgenId)).get(fields, params)
      leadData = testLeadData[leadgenId]
      console.log('Got Lead Data', leadData)
      parsedLeadData = JSON.parse(leadData)
      //* b) Parse Leads data into appropriate object
      leadgenData = parsedLeadData.field_data.reduce((leadgenDataObject, leadgenField) => {
        return Object.assign(leadgenDataObject, {
          [`${leadgenField.name}`]: `${leadgenField.values[0]}`
        })
      }, {})

      stringifiedLeadgenData = JSON.stringify(leadgenData)
      // Data & config for S3
      leadgenJsonTimeStamp = Date.now()
      s3Params = {
        Body: stringifiedLeadgenData,
        Bucket: 'facebook-leadflow',
        Key: `${nameOfS3Folder}/${leadgenJsonTimeStamp}.json`
      }
      // Data & config for Zoho
      formData = new FormData()
      formData.append('leadData', stringifiedLeadgenData)
      transformedData = {
        body: formData,
        config: {
          headers: formData.getHeaders(),
        }
      }
      //* c) Store leadgen data in S3
      s3Res = await s3.putObject(s3Params).promise();
      console.log('Lead stored in S3', s3Res);
      //* d) Store leadgen data in Zoho
      zohoRes = await axios({
        method: 'post',
        url: ZOHO_API_ENQUIRES,
        data: transformedData.body,
        ...transformedData.config
      })
      console.log('Res from Zoho', zohoRes)
      status = zohoRes.status
    } catch (error) {
      console.log('ERROR', error)
      throw new Error(error)
    }
  }

  return {
    statusCode: status
  }
}