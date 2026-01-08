/**
 * Logger utility using Winston
 */
const winston = require('winston');
const path = require('path');
const fs = require('fs');

let logger = null;

function createLogger(config = {}) {
    const logLevel = config.level || 'info';
    const logFile = config.file;
    const logToConsole = config.console !== false;

    const transports = [];

    // Console transport
    if (logToConsole) {
        transports.push(new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                    return `${timestamp} [${level}] ${message} ${metaStr}`;
                })
            )
        }));
    }

    // File transport
    if (logFile) {
        const logDir = path.dirname(logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        transports.push(new winston.transports.File({
            filename: logFile,
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.json()
            )
        }));
    }

    logger = winston.createLogger({
        level: logLevel,
        transports
    });

    return logger;
}

function getLogger() {
    if (!logger) {
        logger = createLogger();
    }
    return logger;
}

module.exports = { createLogger, getLogger };
