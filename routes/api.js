'use strict';

const Joi = require('joi');
const apiClient = require('../lib/api-client');
const express = require('express');
const router = new express.Router();
const tools = require('../lib/tools');

router.post('/toggle/flagged', (req, res) => {
    const schema = Joi.object().keys({
        mailbox: Joi.string()
            .hex()
            .lowercase()
            .length(24)
            .required(),
        message: Joi.string()
            .regex(/^\d+(,\d+)*$/i)
            .required(),
        flagged: Joi.boolean()
            .truthy(['Y', 'true', 'yes', 'on', 1])
            .falsy(['N', 'false', 'no', 'off', 0, ''])
    });

    delete req.body._csrf;

    let result = Joi.validate(req.body, schema, {
        abortEarly: false,
        convert: true,
        allowUnknown: true
    });

    if (result.error) {
        return res.json({
            error: result.error.message
        });
    }

    apiClient.messages.update(
        req.user.id,
        result.value.mailbox,
        result.value.message,
        {
            flagged: result.value.flagged
        },
        (err, response) => {
            if (err) {
                return res.json(err.message);
            }
            res.json(response);
        }
    );
});

router.post('/toggle/seen', (req, res) => {
    const schema = Joi.object().keys({
        mailbox: Joi.string()
            .hex()
            .lowercase()
            .length(24)
            .required(),
        message: Joi.string()
            .regex(/^\d+(,\d+)*$/i)
            .required(),
        seen: Joi.boolean()
            .truthy(['Y', 'true', 'yes', 'on', 1])
            .falsy(['N', 'false', 'no', 'off', 0, ''])
    });

    delete req.body._csrf;

    let result = Joi.validate(req.body, schema, {
        abortEarly: false,
        convert: true,
        allowUnknown: true
    });

    if (result.error) {
        return res.json({
            error: result.error.message
        });
    }

    apiClient.messages.update(
        req.user.id,
        result.value.mailbox,
        result.value.message,
        {
            seen: result.value.seen
        },
        (err, response) => {
            if (err) {
                return res.json(err.message);
            }
            res.json(response);
        }
    );
});

router.post('/move', (req, res) => {
    const schema = Joi.object().keys({
        mailbox: Joi.string()
            .hex()
            .lowercase()
            .length(24)
            .required(),
        message: Joi.string()
            .regex(/^\d+(,\d+)*$/i)
            .required(),
        target: Joi.string()
            .hex()
            .lowercase()
            .length(24)
            .required()
    });

    delete req.body._csrf;

    let result = Joi.validate(req.body, schema, {
        abortEarly: false,
        convert: true,
        allowUnknown: true
    });

    if (result.error) {
        return res.json({
            error: result.error.message
        });
    }

    apiClient.messages.update(
        req.user.id,
        result.value.mailbox,
        result.value.message,
        {
            moveTo: result.value.target
        },
        (err, response) => {
            if (err) {
                return res.json(err.message);
            }
            res.json(response);
        }
    );
});

router.post('/delete', (req, res) => {
    const schema = Joi.object().keys({
        mailbox: Joi.string()
            .hex()
            .lowercase()
            .length(24)
            .required(),
        message: Joi.string()
            .regex(/^\d+(,\d+)*$/i)
            .required()
    });

    delete req.body._csrf;

    let result = Joi.validate(req.body, schema, {
        abortEarly: false,
        convert: true,
        allowUnknown: true
    });

    if (result.error) {
        return res.json({
            error: result.error.message
        });
    }

    apiClient.mailboxes.list(req.user.id, true, (err, mailboxes) => {
        if (err) {
            return res.json({ error: err.message });
        }

        let mailbox = mailboxes.find(box => box.id === result.value.mailbox);
        let trash = mailboxes.find(box => box.specialUse === '\\Trash');
        if (!mailbox) {
            return res.json({
                error: 'Invalid mailbox'
            });
        }

        if (mailbox.specialUse === '\\Trash' || !trash) {
            // delete permanently

            let messages = result.value.message
                .split(',')
                .map(id => Number(id))
                .filter(id => id);
            let pos = 0;
            let deleted = [];
            let processNext = () => {
                if (pos >= messages.length) {
                    return res.json({
                        success: true,
                        action: 'delete',
                        id: deleted
                    });
                }
                let id = messages[pos++];

                apiClient.messages.delete(req.user.id, result.value.mailbox, id, (err, response) => {
                    if (err) {
                        deleted.push([id, false, { error: err.message, code: err.code }]);
                    } else {
                        deleted.push([id, (response && response.success) || false]);
                    }
                    setImmediate(processNext);
                });
            };
            return setImmediate(processNext);
        } else {
            // move to trash
            apiClient.messages.update(
                req.user.id,
                result.value.mailbox,
                result.value.message,
                {
                    moveTo: trash.id
                },
                (err, response) => {
                    if (err) {
                        return res.json(err.message);
                    }
                    response.action = 'move';
                    res.json(response);
                }
            );
        }
    });
});

router.post('/list', (req, res) => {
    const schema = Joi.object().keys({
        mailbox: Joi.string()
            .hex()
            .lowercase()
            .length(24)
            .required(),
        cursorType: Joi.string()
            .empty('')
            .valid('next', 'previous'),
        cursorValue: Joi.string()
            .empty('')
            .base64(),
        page: Joi.number()
            .empty('')
            .default(1)
    });

    delete req.body._csrf;

    let result = Joi.validate(req.body, schema, {
        abortEarly: false,
        convert: true,
        allowUnknown: true
    });

    if (result.error) {
        return res.json({
            error: result.error.message
        });
    }

    let params = {};
    if (result.value.cursorType && result.value.cursorValue) {
        params[result.value.cursorType] = result.value.cursorValue;
    }

    apiClient.messages.list(req.user.id, result.value.mailbox, params, (err, response) => {
        if (err) {
            return res.json(err.message);
        }
        response.results.forEach(message => {
            message.fromHtml = tools.getAddressesHTML(message.from, true);
        });
        res.json(response);
    });
});

module.exports = router;