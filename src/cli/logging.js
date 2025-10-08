import tryBoxen from './boxen.js';

/** Lightweight logging helpers that wrap messages in boxen UI. */

export function logError(message) {
    console.log(
        tryBoxen(message, {
            title: 'Error',
            padding: 0.7,
            margin: 1,
            borderColor: 'red',
            float: 'center',
        }),
    );
}

export function logSuccess(message) {
    console.log(
        tryBoxen(message, {
            title: 'Success',
            padding: 0.7,
            margin: 1,
            borderColor: 'green',
            float: 'center',
        }),
    );
}

export function logWarning(message) {
    console.log(
        tryBoxen(message, {
            title: 'Warning',
            padding: 0.7,
            margin: 1,
            borderColor: 'yellow',
            float: 'center',
        }),
    );
}
