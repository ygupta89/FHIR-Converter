// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

var authApiKey = require('./lib/auth-api-key/auth-api-key');
var constants = require('./lib/constants/constants');
var express = require('express');
var cookieParser = require('cookie-parser');
var errorCodes = require('./lib/error/error').errorCodes;
var errorMessage = require('./lib/error/error').errorMessage;
var fs = require('fs');
var fse = require('fs-extra');
var gfs = require('./lib/git-filesystem/git-filesystem')(constants.TEMPLATE_FILES_LOCATION);
var path = require('path');
var bodyParser = require('body-parser');
var swaggerUi = require('swagger-ui-express');
var swaggerJSDoc = require('swagger-jsdoc');
var WorkerPool = require('./lib/workers/workerPool');
var fileSystemCache = require('./lib/fsCache/cache');
var handlebarsHelpers = require('./lib/handlebars-converter/handlebars-helpers').external;
var ncp = require('ncp').ncp;

module.exports = function (app) {
    const workerPool = new WorkerPool('./src/lib/workers/worker.js', require('os').cpus().length);
    let templateCache = new fileSystemCache(constants.TEMPLATE_FILES_LOCATION);
    templateCache.init();
    let messageCache = new fileSystemCache(constants.SAMPLE_DATA_LOCATION);
    messageCache.init();
    app.use(bodyParser.json());
    app.use(bodyParser.text());
    app.use(express.static(constants.STATIC_LOCATION));
    app.use('/codemirror', express.static(constants.CODE_MIRROR_LOCATION));

    // access function for constants (test instrumentation)
    app.getConstants = function () {
        return constants;
    };

    // access function for constants  (test instrumentation)
    app.setConstants = function (c) {
        constants = c;
        gfs.setRepoPath(c.TEMPLATE_FILES_LOCATION);
        templateCache = new fileSystemCache(c.TEMPLATE_FILES_LOCATION);
        messageCache = new fileSystemCache(c.SAMPLE_DATA_LOCATION);
        workerPool.broadcast({ 'type': 'constantsUpdated', 'data': JSON.stringify(c) });
    };

    app.setValidApiKeys = function (keys) {
        authApiKey.setValidApiKeys(keys);
    };

    const swaggerSpec = swaggerJSDoc({
        swaggerDefinition: {
            info: {
                title: 'FHIR Converter API',
                // If changing the version update the checks in convert/hl7 and convert/hl7/:template
                version: '1.0'
            }
        },
        apis: [__filename]
    });

    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    app.get('/api-docs.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });

    app.use(cookieParser());

    // Adding auth middleware after static routes and API documentation
    app.use(authApiKey.validateApiKey);

    // Enable git endpoint, we are only allowing a single repo on the "root"
    // Note: This is added after the API key middleware, so a key will be required
    //       git config --local http.http://localhost:2019/git.extraheader "X-MS-CONVERSION-API-KEY: 123"
    app.use('/git', function (req, res, next) {
        if (!req.url.startsWith('/info') &&
            req.url != '/git-upload-pack' &&
            req.url != '/git-receive-pack') {
            // This could also just return 404 at this point, 
            // but passing it on in case we hook something up later  
            next();
        }
        else {
            req.url = '/' + gfs.repoName + req.url;
            gfs.repos.handle(req, res);
            workerPool.broadcast({ 'type': 'templatesUpdated' });
        }
    });


    /**
     * @swagger
     * /api/helpers:
     *   get:
     *     description: Lists available template helpers
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: List of available template helpers
     *       401:
     *         description: Unauthorized
     */
    app.get('/api/helpers', function (req, res) {
        res.json({ helpers: handlebarsHelpers });
        res.status(200);
    });


    /**
     * @swagger
     * /api/messages:
     *   get:
     *     description: Lists available HL7 v2 messages
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: List of available test messages
     *       401:
     *         description: Unauthorized
     */
    app.get('/api/messages', function (req, res) {
        messageCache.keys()
            .then((files) => res.json({ messages: files.map(f => { return { messageName: f }; }) }))
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, 'Unable to access sample message location'));
            });
    });

    /**
     * @swagger
     * /api/messages/{file}:
     *   get:
     *     description: Returns a specific HL7 test message
     *     produces:
     *       - text/plain
     *     parameters:
     *       - name: file
     *         description: Name of a specific file
     *         in: path
     *         required: true
     *         type: string
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: A specific HL7 message
     *       401:
     *         description: Unauthorized
     */
    app.get('/api/messages/:file', function (req, res) {
        messageCache.get(req.params.file)
            .then((content) => res.end(content.toString()))
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, "Message not found"));
            });
    });

    /**
     * @swagger
     * /api/templates/git/status:
     *   get:
     *     description: Lists uncommitted changes
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: Current list of changes
     *       401:
     *         description: Unauthorized
     */
    app.get('/api/templates/git/status', function (req, res) {
        gfs.getStatus().then(function (status) {
            res.json(status);
        });
    });

    /**
     * @swagger
     * /api/templates/git/branches:
     *   get:
     *     description: Lists of branches
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: List of branches
     *       401:
     *         description: Unauthorized
     */
    app.get('/api/templates/git/branches', function (req, res) {
        gfs.getBranches().then(function (branches) {
            res.json(branches);
        });
    });

    /**
     * @swagger
     * /api/templates/git/branches:
     *   post:
     *     description: Create new branch (from head)
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: branch
     *         in: body
     *         required: true
     *         schema:
     *           type: object
     *           properties:
     *             name:
     *               description: Branch name
     *               type: string
     *             baseBranch:
     *               description: Base branch name
     *               type: string
     *           required:
     *             - name
     *     responses:
     *       201:
     *         description: Created
     *       400:
     *         description: Bad request
     *       401:
     *         description: Unauthorized
     *       409:
     *         description: Conflict (unable to create branch)
     */
    app.post('/api/templates/git/branches', function (req, res) {
        if (!req.body.name) {
            res.status(400);
            res.json(errorMessage(errorCodes.BadRequest, 'Branch name required'));
        } else {
            gfs.createBranch(req.body.name, req.body.baseBranch)
                .then(function () {
                    res.status(201);
                    res.end();
                })
                .catch(function (errorReason) {
                    res.status(409);
                    res.json(errorMessage(errorCodes.Conflict, 'Unable to create new branch: ' + errorReason));
                });
        }
    });

    /**
     * @swagger
     * /api/templates/git/checkout:
     *   post:
     *     description: Checkout branch
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: branch
     *         in: body
     *         required: true
     *         schema:
     *           type: object
     *           properties:
     *             name:
     *               description: Branch name
     *               type: string
     *           required:
     *             - name
     *     responses:
     *       200:
     *         description: OK
     *       400:
     *         description: Bad Request
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Branch not found
     */
    app.post('/api/templates/git/checkout', function (req, res) {
        if (!req.body.name) {
            res.status(400);
            res.json(errorMessage(errorCodes.BadRequest, 'Branch name required'));
        } else {
            gfs.getBranches().then(function (branches) {
                if (branches.map(b => { return b.name; }).includes(req.body.name)) {
                    gfs.checkoutBranch(req.body.name)
                        .then(function () {
                            templateCache.clear();
                            workerPool.broadcast({ 'type': 'templatesUpdated' });
                            res.status(200);
                            res.end();
                        })
                        .catch(function (errReason) {
                            res.status(409);
                            res.json(errorMessage(errorCodes.Conflict, 'Unable to checkout branch: ' + errReason));
                        });
                }
                else {
                    res.status(404);
                    res.json(errorMessage(errorCodes.NotFound, 'Branch not found'));
                }
            });
        }
    });

    /**
     * @swagger
     * /api/templates/git/commit:
     *   post:
     *     description: Commit ALL changes
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: commit
     *         in: body
     *         required: false
     *         schema:
     *           type: object
     *           properties:
     *             message:
     *               description: Commit message
     *               type: string
     *             name:
     *               description: Committers name
     *               type: string
     *             email:
     *               description: Committers email
     *               type: string
     *     responses:
     *       200:
     *         description: Changes committed
     *       401:
     *         description: Unauthorized
     *       409:
     *         description: Conflict (no changes to commit)
     */
    app.post('/api/templates/git/commit', function (req, res) {
        gfs.getStatus().then(function (status) {
            if (status.length > 0) {
                gfs.commitAllChanges(req.body.message, req.body.name, req.body.email)
                    .then(
                        function () {
                            res.status(200);
                            res.end();
                        }
                    );
            }
            else {
                res.status(409);
                res.json(errorMessage(errorCodes.Conflict, 'No changes to commit'));
            }
        });
    });

    /**
     * @swagger
     * /api/templates:
     *   get:
     *     description: Lists available templates
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: List of available templates
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Templates not found
     */
    app.get('/api/templates', function (req, res) {
        templateCache.keys()
            .then((files) => res.json({ templates: files.map(f => { return { templateName: f }; }) }))
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, 'Unable to access templates location'));
            });
    });

    /**
     * @swagger
     * /api/templates/{file}:
     *   get:
     *     description: Returns a specific template
     *     produces:
     *       - text/plain
     *     parameters:
     *       - name: file
     *         description: Name of a specific file
     *         in: path
     *         required: true
     *         type: string
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: A specific template
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Not found
     */
    app.get('/api/templates/:file(*)', function (req, res) {
        templateCache.get(req.params.file)
            .then((content) => res.end(content.toString()))
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, "Template not found"));
            });
    });

    /**
     * @swagger
     * /api/templates/{file}:
     *   put:
     *     description: Stores a template in the template store
     *     consumes:
     *       - text/plain
     *     parameters:
     *       - name: file
     *         description: The file name
     *         required: true
     *         in: path
     *       - name: template
     *         description: The conversion template
     *         in: body
     *         required: true
     *         type: string
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *     responses:
     *       201:
     *         description: Created
     *       200:
     *         description: Updated
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     */
    app.put('/api/templates/:file(*)', function (req, res) {
        templateCache.has(req.params.file)
            .then((exists) => {
                templateCache.set(req.params.file, req.body.toString())
                    .then(() => {
                        workerPool.broadcast({ 'type': 'templatesUpdated' });
                        res.status(exists ? 200 : 201);
                        res.end();
                    })
                    .catch(() => {
                        res.status(403);
                        res.json(errorMessage(errorCodes.WriteError, 'Unable to write template ' + req.params.file));
                    });
            });
    });

    /**
    * @swagger
    * /api/templates/{file}:
    *   delete:
    *     description: Deletes a template
    *     parameters:
    *       - name: file
    *         description: Name of a specific file
    *         in: path
    *         required: true
    *         type: string
    *       - name: code
    *         in: query
    *         description: 'API key'
    *         required: false
    *         type: string
    *       - name: X-MS-CONVERSION-API-KEY
    *         in: header
    *         description: 'API key'
    *         required: false
    *         type: string
    *     responses:
    *       204:
    *         description: No content
    *       401:
    *         description: Unauthorized
    *       404:
    *         description: Not found
    */
    app.delete('/api/templates/:file(*)', function (req, res) {
        templateCache.remove(req.params.file)
            .then(() => {
                workerPool.broadcast({ 'type': 'templatesUpdated' });
                res.status(204);
                res.end();
            })
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, 'Unable to find a template with name ' + req.params.file + ' to delete.'));
            });
    });

    /**
     * @swagger
     * /api/UpdateBaseTemplates:
     *   post:
     *     description: Updates base templates (deletes existing data). This should be used only when latest version of templates needs to be pulled.
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: templates updated
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
     */
    app.post('/api/UpdateBaseTemplates', function (req, res) {
        let tempFolderName = path.join(constants.TEMPLATE_FILES_LOCATION, `.temp${new Date().getTime()}`);
        fse.ensureDirSync(tempFolderName);

        // Rename (instead of delete) to avoid timeout.
        var existingFiles = fs.readdirSync(constants.TEMPLATE_FILES_LOCATION);
        existingFiles.forEach(function (fl) {
            if (!fl.startsWith('.')) {
                fse.renameSync(path.join(constants.TEMPLATE_FILES_LOCATION, fl), path.join(tempFolderName, fl));
            }
        });

        // Using ncp since fs/fs-extra failed randomly with ENOENT for src files.
        ncp.limit = 16;
        ncp(constants.BASE_TEMPLATE_FILES_LOCATION, constants.TEMPLATE_FILES_LOCATION, function (err) {
            if (err) {
                res.status(403);
                res.json(errorMessage(errorCodes.WriteError, err.message));
            }
            else {
                templateCache.clear();
                workerPool.broadcast({ 'type': 'templatesUpdated' });
                res.status(200);
                res.end();
            }
        });
    });

    /**
     * @swagger
     * /api/convert/hl7:
     *   post:
     *     description: Converts an HL7 v2 message to FHIR using template
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: conversion
     *         description: Conversion task
     *         in: body
     *         required: true
     *         schema:
     *           type: object
     *           properties:
     *             templateBase64:
     *               type: string
     *             messageBase64:
     *               type: string
     *           required:
     *             - templateBase64
     *             - messageBase64
     *       - name: api-version
     *         in: query
     *         description: API version to use. The current version is 1.0. Previous versions, including passing no version, are deprecated.
     *         required: false
     *         type: string
     *       - name: code
     *         in: query
     *         description: 'API key'
     *         required: false
     *         type: string
     *       - name: X-MS-CONVERSION-API-KEY
     *         in: header
     *         description: 'API key'
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: conversion result and unused segments report
     *       400:
     *         description: Bad request
     *       401:
     *         description: Unauthorized
     */
    app.post('/api/convert/hl7', function (req, res) {
        workerPool.exec({
            'type': '/api/convert/hl7',
            'messageBase64': req.body.messageBase64,
            'templateBase64': req.body.templateBase64,
            'replacementDictionaryBase64': req.body.replacementDictionaryBase64,
            'templatesMapBase64': req.body.templatesMapBase64,
        }).then((result) => {
            res.status(result.status);

            if (req.query['api-version'] === '1.0') {
                res.json(result.resultMsg);
            }
            else {
                if (result.status === 200) {
                    res.json(result.resultMsg.fhirResource);
                }
                else {
                    res.json(result.resultMsg);
                }
            }

            return;
        });
    });


    /**
    * @swagger
    * /api/convert/hl7/{template}:
    *   post:
    *     description: Converts an HL7 v2 message to FHIR using template
    *     produces:
    *       - application/json
    *     consumes:
    *       - text/plain
    *     parameters:
    *       - name: template
    *         description: Name of a specific template
    *         in: path
    *         required: true
    *         type: string
    *       - name: message
    *         description: the message to convert
    *         in: body
    *         required: true
    *         schema:
    *           type: string
    *       - name: api-version
    *         in: query
    *         description: API version to use. The current version is 1.0. Previous versions, including passing no version, are deprecated.
    *         required: false
    *         type: string
    *       - name: code
    *         in: query
    *         description: 'API key'
    *         required: false
    *         type: string
    *       - name: X-MS-CONVERSION-API-KEY
    *         in: header
    *         description: 'API key'
    *         required: false
    *         type: string
    *     responses:
    *       200:
    *         description: Converted message
    *       400:
    *         description: Bad request
    *       401:
    *         description: Unauthorized
    *       404:
    *         description: Template not found
    */
    app.post('/api/convert/hl7/:template(*)', function (req, res) {
        workerPool.exec({
            'type': '/api/convert/hl7/:template',
            'messageContent': req.body.toString(),
            'templateName': req.params.template
        }).then((result) => {
            res.status(result.status);

            if (req.query['api-version'] === '1.0') {
                res.json(result.resultMsg);
            }
            else {
                if (result.status === 200) {
                    res.json(result.resultMsg.fhirResource);
                }
                else {
                    res.json(result.resultMsg);
                }
            }

            return;
        });
    });

    return app;
};
