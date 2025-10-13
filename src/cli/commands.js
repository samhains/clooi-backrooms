/**
 * Build the CLI commands array using the provided handlers. This keeps
 * bin/cli.js focused on orchestration, while preserving identical behavior.
 * @param {object} api
 */
export default function buildCommands(api) {
    const {
        showCommandDocumentation,
        importBackroomsLogFlow,
        retryResponse,
        generateMessage,
        composeAiMessage,
        saveConversationState,
        loadSavedState,
        systemPromptSelection,
        newConversation,
        rewind,
        selectChildMessage,
        selectSiblingMessage,
        rewindTo,
        printOrCopyData,
        renderLastMessage,
        useEditor,
        useEditorPlain,
        editMessage,
        addMessages,
        sendImageMessage,
        mergeUp,
        showHistory,
        stopSettingsWatcher,
        loadConversationState,
        exportConversation,
        loadConversation,
        debug,
        steerCommand,
        hasChildren,
        hasSiblings,
        hasParent,
        hasConversationId,
        resumeAvailable,
        conversation,
    } = api;

    return [
        {
            name: '!help - Show command documentation',
            value: '!help',
            usage: '!help [command] | <command> --help',
            description:
        'Show command documentation.\n\t[command]: If provided, show the documentation for that command, otherwise shows documentation for all commands.',
            command: async args => showCommandDocumentation(args[1]),
        },
        {
            name: '!import - Import a Backrooms log',
            value: '!import',
            usage: '!import [path]',
            description:
        'Import a .txt transcript by path. If not provided, opens a picker in the import/ folder.',
            command: async args => importBackroomsLogFlow(args[1]),
        },
        {
            name: '!mu - Regenerate last response',
            value: '!mu',
            usage: '!mu',
            description:
        'Regenerate the last response. Equivalent to running !rw -1 and then !gen.',
            available: hasParent,
            command: async () => retryResponse(),
        },
        {
            name: '!gen - Generate response',
            value: '!gen',
            usage: '!gen',
            description: 'Generate a response without sending an additional user message',
            command: async () => generateMessage(),
        },
        {
            name: '!ai - Draft user response with AI',
            value: '!ai',
            usage: '!ai [--context <slug>] [instructions]',
            description:
        'Draft the next user message using an AI composer.\n\t--context <slug>: Optional context slug (without .txt) from ./contexts. Defaults to config.json aiContext or the active conversation context.\n\t[instructions]: Optional extra guidance for this draft.',
            command: async args => composeAiMessage(args),
        },
        {
            name: '!save - Save conversation state',
            value: '!save',
            usage: '!save [name]',
            description:
        'Save a named pointer to the current conversation state\n\t[name]: If a name is provided, it will save the state with that name, otherwise a prompt will appear.',
            command: async args => saveConversationState(args[1]),
        },
        {
            name: '!load - Load conversation state',
            value: '!load',
            usage: '!load [name]',
            description:
        'Load a saved conversation state.\n\t[name]: If a name is provided, it will load the state with that name, otherwise a prompt will appear showing saved states.',
            command: async args => loadSavedState(args[1]),
        },
        {
            name: '!system - Select system prompt',
            value: '!system',
            usage: '!system [name]',
            description:
        'Select and load a system prompt from ./contexts directory.\n\t[name]: If a name is provided (without .txt extension), it will load that system prompt directly, otherwise a menu will appear showing available prompts.',
            command: async args => systemPromptSelection(args[1]),
        },
        {
            name: '!new - Start new conversation',
            value: '!new',
            usage: '!new',
            description: 'Start a new conversation.',
            command: async () => newConversation(),
        },
        {
            name: '!rw - Rewind to a previous message',
            value: '!rw',
            usage: '!rw [index] [branch_index]',
            description:
        'Rewind to a previous message.\n\t[index]: If positive, rewind to message with that index. If negative, go that many steps backwards from the current index. If not provided, a prompt will appear to choose where in conversation history to rewind to.\n\t[branch]: If provided, select an alternate sibling at the provided index.',
            available: hasParent,
            command: async args => rewind(args[1] ? parseInt(args[1], 10) : null, args[2] ? parseInt(args[2], 10) : null),
        },
        {
            name: '!fw - Go forward to a child message',
            value: '!fw',
            usage: '!fw [index]',
            description:
        'Go forward to a child message.\n\t[index]: If positive, go to the child message with that index. If 0, go to the first child message. If not provided, a prompt will appear to choose which child message to go to.',
            available: hasChildren,
            command: async args => selectChildMessage(args[1] ? parseInt(args[1], 10) : null),
        },
        {
            name: '!alt - Go to a sibling message',
            value: '!alt',
            usage: '!alt [index]',
            description:
        'Go to a sibling message.\n\t[index]: Index of sibling message. If not provided a prompt will appear to choose which sibling message to go to.',
            available: hasSiblings,
            command: async args => selectSiblingMessage(args[1] ? parseInt(args[1], 10) : null),
        },
        {
            name: '!w (up) - Navigate to the parent message',
            value: '!w',
            usage: '!w',
            description: 'Navigate to the parent message. Equivalent to running !rw -1.',
            available: hasParent,
            command: async () => rewindTo(-1),
        },
        {
            name: '!> - Go right / to the next sibling',
            value: '!>',
            usage: '!>',
            description: 'Go right / to the next sibling.',
            available: hasSiblings,
            command: async () => selectSiblingMessage(+1),
        },
        {
            name: '!< - Go left / to the previous sibling',
            value: '!<',
            usage: '!<',
            description: 'Go left / to the previous sibling.',
            available: hasSiblings,
            command: async () => selectSiblingMessage(-1),
        },
        {
            name: '!cp - Copy data to clipboard',
            value: '!cp',
            usage: '!cp [type] [branch_index] [type]',
            description:
        'Copy data to clipboard.\n\t[type]: If arguments aren\'t provided, defaults to copying current index/branch and plaintext of the message. If "?" is one of the arguments, opens dropdown for types of data to copy.',
            command: async args => printOrCopyData('copy', args.slice(1)),
        },
        {
            name: '!pr - Print data to console',
            value: '!pr',
            usage: '!pr [index] [branch_index] [type]',
            description:
        'Print data to console.\n\t[type]: !pr . prints current node text. If arguments aren\'t provided, opens dropdown for types of data to print.',
            command: async args => printOrCopyData('print', args.slice(1)),
        },
        {
            name: '!render - Save last message as PNG',
            value: '!render',
            usage: '!render [slug] [--pane-id=<id>] [--dir=<path>] [--output=<path>]',
            description:
        'Capture the active WezTerm pane as a PNG and store it locally.\n\t[slug]: Optional filename fragment (defaults to role + message snippet).\n\t--pane-id: Override pane detection.\n\t--dir/--output: Override the destination directory or file path.',
            available: hasConversationId,
            command: async args => renderLastMessage(args),
        },
        {
            name: '!ml - Open the editor (for multi-line messages)',
            value: '!ml',
            usage: '!ml',
            description:
        'Open the editor (for multi-line messages). Detected absolute paths or URLs are attached as images when the message is sent.',
            command: async () => useEditor(),
        },
        {
            name: '!ml2 - Open the editor without attachment parsing',
            value: '!ml2',
            usage: '!ml2',
            description:
        'Open the editor (legacy !ml behavior). The message is sent exactly as written, without scanning for image attachments.',
            command: async () => useEditorPlain(),
        },
        {
            name: '!edit - Edit and fork the current message',
            value: '!edit',
            usage: '!edit',
            description:
        'Opens the text of the current message in the editor. If you make changes and save, a copy of the message (with the same author and type) will be created as a sibling message.',
            available: hasParent,
            command: async args => editMessage(null, args.slice(1)),
        },
        {
            name: '!concat - Concatenate message(s) to the conversation',
            value: '!concat',
            usage: '!concat [message]',
            description:
        'Concatenate message(s) to the conversation.\n\t[message]: If provided, concatenate the message as a user message. If not provided, the editor will open, and you write either a string for a single user message or any number of consecutive messages (with sender specified in headers) in the standard transcript format.',
            command: async args => addMessages(args[1]),
        },
        {
            name: '!image - Attach an image with an optional prompt',
            value: '!image',
            usage: '!image <image_path> [prompt]',
            description:
        'Attach a local image to the next request. Provide prompt text after the path to describe what to do with the image.',
            command: async (args, raw) => sendImageMessage(raw),
        },
        {
            name: '!merge - Merge the last message up into the parent message',
            value: '!merge',
            usage: '!merge',
            description:
        'Creates a new sibling of the parent message with the last message\'s text appended to the parent message\'s text, and which inherits other properties of the parent like author.',
            available: hasParent,
            command: async () => mergeUp(),
        },
        {
            name: '!history - Show conversation history',
            value: '!history',
            usage: '!history',
            description:
        'Display conversation history in formatted boxes. If you want to copy the raw conversation history transcript, use !cp history or !pr history instead.',
            available: hasParent,
            command: async () => {
                showHistory();
                return conversation();
            },
        },
        {
            name: '!exit - Exit CLooI',
            value: '!exit',
            usage: '!exit',
            description: 'Exit CLooI.',
            command: async () => {
                await stopSettingsWatcher();
                process.exit();
            },
        },
        {
            name: '!resume - Resume last conversation',
            value: '!resume',
            usage: '!resume',
            description: 'Resume the last conversation.',
            available: resumeAvailable,
            command: async () => loadConversationState(),
        },
        {
            name: '!export - Export conversation tree to JSON',
            value: '!export',
            usage: '!export [filename]',
            description:
        'Export conversation tree to JSON.\n\t[filename]: If provided, export the conversation tree to a file with that name, otherwise a prompt will appear to choose a filename.',
            available: hasConversationId,
            command: async args => exportConversation(args[1]),
        },
        {
            name: '!open - Load a saved conversation by id',
            value: '!open',
            usage: '!open <id>',
            description: 'Load a saved conversation by id.\n\t<id>: The id of the conversation to load.',
            command: async args => loadConversation(args[1]),
        },
        {
            name: '!debug - Debug',
            value: '!debug',
            usage: '!debug',
            description: 'Run debug command.',
            command: async args => debug(args.slice(1)),
        },
        {
            name: '!steer - change steering feature',
            value: '!steer',
            usage: '!steer <id> <amount>',
            description: '',
            command: async args => steerCommand(args),
        },
    ];
}
