import { tryBoxen } from './boxen.js';
import { replaceWhitespace } from './ui.js';
import { getChildren, getSiblings } from '../utils/conversation.js';

/**
 * Functions for rendering conversation history trees with navigation hints.
 */

/** Render the conversation header line. */
export function conversationStart(conversationId) {
  return tryBoxen(`Start of conversation ${conversationId}`, {
    padding: 0.7,
    margin: 2,
    fullscreen: (width, height) => [width - 1, 1],
    borderColor: 'blue',
    borderStyle: 'doubleSingle',
    float: 'center',
    dimBorder: true,
  });
}

/** Render a nav button index with selection/visited markers. */
export function navButton(node, idx, mainMessageId) {
  let buttonString = idx;
  if (node.unvisited) {
    buttonString = `${buttonString}*`;
  }
  return node.id === mainMessageId ? `[${buttonString}]` : `${buttonString}`;
}

/**
 * Render a single conversation message with sibling/child hints.
 * @param {*} conversationMessage
 * @param {number|null} index
 * @param {{messages: *, getAILabel: Function, userDisplay: string}} ctx
 */
export function conversationMessageBox(conversationMessage, index = null, ctx) {
  const { messages, getAILabel, userDisplay } = ctx;
  if (conversationMessage.unvisited) {
    conversationMessage.unvisited = false;
  }
  const children = getChildren(messages, conversationMessage.id);
  const siblings = getSiblings(messages, conversationMessage.id);
  const aiMessage = Boolean(conversationMessage.role === getAILabel());
  const userMessage = Boolean(conversationMessage.role === userDisplay);
  const indexString = index !== null ? `[${index}] ` : '';
  const childrenString = children.length > 0 ? ` ── !fw [${children.map((_, idx) => `${idx}`).join(' ')}]` : '';
  const siblingsString = siblings.length > 1 ? ` ── !alt ${siblings.map((sibling, idx) => navButton(sibling, idx, conversationMessage.id)).join(' ')}` : '';

  // Handle complex content like ASCII art - preserve original formatting
  const messageText = replaceWhitespace(conversationMessage.message);

  // Check if this looks like complex ASCII art or has ANSI codes (stored format or escaped)
  const hasComplexFormatting = messageText.includes('\u001b[') || messageText.includes('[3') || messageText.includes('█') || messageText.includes('▓') || messageText.includes('≋');

  return tryBoxen(messageText, {
    title: `${indexString}${conversationMessage.role}${siblingsString}${childrenString}`,
    padding: hasComplexFormatting ? 0.5 : 0.7,
    margin: {
      top: 1,
      bottom: 0,
      left: userMessage ? 1 : 1,
      right: aiMessage ? 1 : 1,
    },
    dimBorder: true,
    borderColor: aiMessage ? 'white' : (userMessage ? 'blue' : 'green'),
    float: hasComplexFormatting ? 'left' : (aiMessage ? 'left' : (userMessage ? 'right' : 'center')),
    // Let tryBoxen calculate width for complex content
    width: hasComplexFormatting ? undefined : undefined,
  });
}

/** Render all message boxes for the given history path. */
export function historyBoxes(messageHistory, ctx) {
  return messageHistory?.map((m, index) => conversationMessageBox(m, index, ctx)).join('\n');
}
