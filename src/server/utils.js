/** Resolve on the next tick (micro delay for streaming/buffering). */
export function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Filter objects to only include whitelisted properties set in
 * settings.apiOptions.perMessageClientOptionsWhitelist.
 * Returns null if no whitelist provided; original input if whitelist has no entry for client.
 * @param {object} inputOptions
 * @param {string} clientToUseForMessage
 * @param {object|null} perMessageClientOptionsWhitelist
 */
/**
 * Filter objects to only include whitelisted properties set in
 * settings.apiOptions.perMessageClientOptionsWhitelist.
 * Returns null if no whitelist provided; original input if whitelist has no entry for client.
 */
export function filterClientOptions(inputOptions, clientToUseForMessage, perMessageClientOptionsWhitelist) {
  if (!inputOptions || !perMessageClientOptionsWhitelist) {
    return null;
  }

  if (
    perMessageClientOptionsWhitelist.validClientsToUse &&
    inputOptions.clientToUse &&
    perMessageClientOptionsWhitelist.validClientsToUse.includes(inputOptions.clientToUse)
  ) {
    clientToUseForMessage = inputOptions.clientToUse;
  } else {
    inputOptions.clientToUse = clientToUseForMessage;
  }

  const whitelist = perMessageClientOptionsWhitelist[clientToUseForMessage];
  if (!whitelist) {
    return inputOptions;
  }

  const outputOptions = {
    clientToUse: clientToUseForMessage,
  };

  for (const property of Object.keys(inputOptions)) {
    const allowed = whitelist.includes(property);

    if (!allowed && typeof inputOptions[property] === 'object') {
      // Check for nested properties
      for (const nestedProp of Object.keys(inputOptions[property])) {
        const nestedAllowed = whitelist.includes(`${property}.${nestedProp}`);
        if (nestedAllowed) {
          outputOptions[property] = outputOptions[property] || {};
          outputOptions[property][nestedProp] = inputOptions[property][nestedProp];
        }
      }
      continue;
    }

    // Copy allowed properties to outputOptions
    if (allowed) {
      outputOptions[property] = inputOptions[property];
    }
  }

  return outputOptions;
}
