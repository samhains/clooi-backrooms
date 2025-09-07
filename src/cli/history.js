import { tryBoxen } from './boxen.js';
import { replaceWhitespace } from './ui.js';
import { getChildren, getSiblings } from '../conversation.js';

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

export function navButton(node, idx, mainMessageId) {
  let buttonString = idx;
  if (node.unvisited) {
    buttonString = `${buttonString}*`;
  }
  return node.id === mainMessageId ? `[${buttonString}]` : `${buttonString}`;
}

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
  const messageText = replaceWhitespace(conversationMessage.message);
  return tryBoxen(messageText, {
    title: `${indexString}${conversationMessage.role}${siblingsString}${childrenString}`,
    padding: 0.7,
    margin: {
      top: 1,
      bottom: 0,
      left: userMessage ? 1 : 1,
      right: aiMessage ? 1 : 1,
    },
    dimBorder: true,
    borderColor: aiMessage ? 'white' : (userMessage ? 'blue' : 'green'),
    float: aiMessage ? 'left' : (userMessage ? 'right' : 'center'),
  });
}

export function historyBoxes(messageHistory, ctx) {
  return messageHistory?.map((m, index) => conversationMessageBox(m, index, ctx)).join('\n');
}

