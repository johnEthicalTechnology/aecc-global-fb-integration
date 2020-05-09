const axios = require('axios');
const FormData = require('form-data')
const { GraphQLClient, request } = require('graphql-request')
const apiKey = '8f3203d6c542fdee056887c2e8f4fa6adfd02616'
const apiUrl = 'https://vownet.salestrekker.com/graphql/'
const apiKeyZoho = 'https://www.zohoapis.com/crm/v2/functions/test/actions/execute?auth_type=apikey&zapikey=1003.6e2b8513bfb710e43f6d77e98657a3b8.2119a3d3818be4f8d9c4dd7f19cb5b5e'


async function getApiToken() {
    const mutationForToken = `
        mutation {
            authenticate(apiKey: "${apiKey}") {
                token
            }
        }
    `
    const tokenRes = await request(${apiUrl}, mutationForToken)
    return tokenRes.authenticate.token

}

// async function dealChangeStage(apiToken)

async function dealCreatedOrUpdated(apiToken, dealId) {
    const respData = {}
    const graphQLClient = new GraphQLClient(apiUrl, {
        headers: {
        Authorization: "Bearer "  + apiToken
        }
    })

    // all ids needed for queries
    const contactId = respData.dataFromDealQuery.ticket.ticketClientTypes[0].idContact
    const stageId = respData.dataFromDealQuery.ticket.idStage
    const spouseId = respData.dataFromContactQuery.contact.person.information.idSpouse
    const workflowId = respData.dataFromDealQuery.ticket.idWorkflow

  const queryDeal = `
      query {
        ticket(id: "${dealId}") {
            name
            timeStamp
            idStage
            idWorkflow
            ticketClientTypes {
                idContact
            }
            assets {
                assetType {
                    name
                }
                address {
                    streetNumber
                    suiteNumber
                    street
                    streetType
                    suburb
                    city
                    state
                    country
                    postCode
                }
            }
        }
    }
    `

    try {
        respData.dataFromDealQuery = await graphQLClient.request(queryDeal)
    } catch (error) {
        console.error('data from deal query error',error)
    };



    console.log('--------CONTACT ID ', contactId)
    const queryContact =`
      query {
        contact(id: "${contactId}") {
            id
            idOwner
            income {
                payg {
                    grossSalary
                }
              }
                person {
                    employments {
                        employerName
                        role
                        type
                        startDate
                    }
                    information {
                        firstName
                        familyName
                        dateOfBirth
                        numberOfDependents
                        dependents {
                            name
                            dateOfBirth
                        }
                        idSpouse
                        spouseFirstName
                        spouseFamilyName
                    }
                    contact {
                        mailingAddress {
                        suiteNumber
                        streetNumber
                        street
                        suburb
                        city
                        state
                        country
                        postCode
                    }
                        email
                        secondaryEmail
                        primaryCode
                        primary
                        homeCode
                        home

              }
            }
          }
        }
    `

    try {
        respData.dataFromContactQuery = await graphQLClient.request(queryContact)
    } catch (error) {
        console.error('data form contact query',error)
    };

    const queryWorkflow = `
    query {
        workflow(id: ${workflowId}) {
          name
          description
          timeStamp
          type{
            name
          }
          stages {
              name
              timestamp
          }
        }
      }
    `

    try {
        respData.dataFromWorkflowQuery = await graphQLClient.request(queryWorkflow)
    } catch (error) {
        console.error('data from workflow query', error);
    };


    const querySpouse = `
    query {
        contact(id: ${spouseId}) {
            income {
                grossValue
                payg {
                  grossSalary
                 }
                }
            person{
                information {
                    firstName
                    familyName
                }
                employments {
                  employerName
                  role
                  employerType
                  startDate
                  type
                  }
                }
              }

    `
    try {
        respData.dataFromSpouseQuery = await graphQLClient.request(querySpouse)
    } catch (error) {
        console.error('data from spouse query', error);
    };


    return respData

    };

    async function createZohoBody(data) {
        const salesTrekkerData = JSON.stringify(data);
        const formData = new FormData();
        formData.append("updates", salesTrekkerData);

        const transformedData = {
          body: formData,
          config: {
            headers: formData.getHeaders(),
         },
        };
        console.log('logging the data from createzohobody function', transformedData, {...transformedData.config})

        axios({
            method: 'post',
            url: apiKeyZoho,
            data: transformedData.body,
            ...transformedData.config
        })
        .then((res) => {
            console.log('this is the res',res.data)
        })
        .catch((err) => {
            console.log(err);

        })
    }


     // 0) req body - get the id and save in variable (with a descriptive title)
    // 1) req a token for the req using the ;api key
    // 2)  graphql request to sales trekker with the id for appropriate fields
    // 3) Use axios to send the graphql resp to zoho done
    // 4) transform the arg to a map
    // 5) save the map to zoho using zoho.crm.upsert



module.exports = async (req, res) => {
    console.log(req.body);
    const dealId = req.body.id;
    const apiToken = await getApiToken();
    const dealData = await dealCreatedOrUpdated(apiToken, dealId);
    const zohoBody = await createZohoBody(dealData);
    console.log('whole of data deal', dealData);



};