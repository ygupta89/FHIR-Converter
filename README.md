# FHIR® Converter

![Node.js CI](https://github.com/microsoft/FHIR-Converter/workflows/Node.js%20CI/badge.svg?branch=master)

For Healthcare IT teams and solution architects who want to integrate clinical data currently in different formats, the FHIR® Converter is an open source project that enables the conversion of legacy formatted health data to FHIR, expanding the use cases for health data and enabling interoperability.  

Right now, the FHIR Converter transforms HL7 v2 messages into FHIR bundles using templates that define the mappings between the two data formats. Leveraging the FHIR Converter organizations can customize or create their own mapping templates based on their HL7 v2 implementation and transform them into FHIR bundles. These FHIR bundles are returned for further data manipulation or can be immediately persisted into a FHIR server, such as the [Azure API for FHIR](https://azure.microsoft.com/en-us/services/azure-api-for-fhir/). The FHIR Converter released to open source on Thursday March 5th, 2020.

The open-source FHIR Converter consists of the following functionality:

1. A set of starting templates, leveraging [handlebars](https://handlebarsjs.com/), to translate HL7 v2 messages into FHIR bundles. These templates were generated based on the mappings defined by the [HL7 community](https://confluence.hl7.org/display/OO/2-To-FHIR+Project). As more mappings are defined, we will continue to release updated versions of these templates. Current examples are ADT-A01, OML_O21, ORU-R01, and VXU_V04.
1. A set of sample messages to accompany the released templates.
1. A collection of APIs to convert messages real time and assist in the template management and creation.
1. A Web UI editor to modify and create templates and test single message conversion to FHIR bundles.

FHIR® is the registered trademark of HL7 and is used with the permission of HL7. Use of the FHIR trademark does not constitute endorsement of this product by HL7

## Deploy the FHIR Converter

The source code is available to be deployed in any manner you would like. The FHIR Converter can be run on-prem or in the cloud. Below are details to quickly deploy to Azure or deploy locally.

### Deploy to Azure
Click this link to deploy in Azure.

<a href="https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2FMicrosoft%2FFHIR-Converter%2Fmaster%2Fdeploy%2Fdefault-azuredeploy.json" target="_blank">
    <img src="https://azuredeploy.net/deploybutton.png"/>
</a>

Note that the Service Name will be included in the URL you will use to access the application. In addition, the API Key is automatically generated when you deploy the App Service but you can change this to another value if you want.

Once deployment is complete, you can go to the newly created App Service to see the details. Here you will get the URL to access your FHIR Converter (https://\<SERVICE NAME>.azurewebsites.net). 

If you need to find your API Key again or change the value take the following steps:
1. Navigate to your App Service
1. Under Settings, select Configuration
1. You will see CONVERSION_API_KEYS listed here. You can view the key and edit from this location.

### Deploy locally
Follow these steps to deploy a local copy of the FHIR Converter

Make sure that you have Node.js >=10.10.0 < 11.0 installed

```
git clone https://github.com/microsoft/FHIR-Converter/
cd FHIR-Converter
npm install
npm start
```

Once this completes, you can access Web UI locally at http://localhost:2019/

## Getting started
Now that you have deployed the FHIR Converter, you can get started with using the functionality. You will need to provide your API key when accessing service for the first time. We have included several documents to help you with template creation and management, understanding message conversion and some general summary guides that include functionality overview.

If you are ready to start modifying and creating your own templates, check out the [how to create templates guide](docs/template-creation-how-to-guide.md) as the first place to start.

## Documentation

### Template creation and management details

* [How to create templates guide](docs/template-creation-how-to-guide.md)
* [Partial template conceptual guide](docs/partial-template-concept.md)
* [Examples of using helper functions](docs/using-helpers-concept.md)

### Message conversion details

* [Converting messages conceptual guide](docs/convert-messages-concept.md)

### Additional resources

* [Summary of available APIs](docs/api-summary.md)
* [Helper function summary](docs/helper-functions-summary.md)
* [Web UI summary](docs/web-ui-summary.md)

## External resources

* [Handlebars Documentation](https://handlebarsjs.com/)
* [HL7 Community 2-To-FHIR-Project](https://confluence.hl7.org/display/OO/2-To-FHIR+Project)

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit [the CLA site](https://cla.opensource.microsoft.com).

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
