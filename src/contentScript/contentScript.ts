import * as MarkdownIt from "markdown-it"
import crypto = require('crypto')
import { tmpdir } from 'os'
import { sep } from 'path'

const diagramsTempDir = `${tmpdir}${sep}joplin-plantUml2-plugin${sep}`

const fenceNameRegExp = /^plant-?uml$/i

// Fix for #9: while rendering the new image display the previous one that is probably of the same size.
// In this way the editor will not scroll.
let previousDiagramId = null

export default function (context: { contentScriptId: string }) {
    return {
        plugin: function (markdownIt: MarkdownIt, _options) {
            const defaultRender = markdownIt.renderer.rules.fence || function (tokens, idx, options, env, self) {
                return self.renderToken(tokens, idx, options)
            }

            markdownIt.renderer.rules.fence = function (tokens, idx, options, env, self) {
                const token = tokens[idx]
                // console.log('token', token)
                if (!fenceNameRegExp.test(token.info)) return defaultRender(tokens, idx, options, env, self)

                const diagramId = crypto.createHash('sha1').update(token.content).digest('hex')
                // console.log(`plantuml[${diagramId}] render markdown-it plugin`)

                const pluginRequest = JSON.stringify({ content: token.content, id: diagramId })

                const sendContentToJoplinPlugin = `
                diagram = null;
                // Configure context menu
                document.getElementById('plantuml-body-${diagramId}').addEventListener('mousedown', e => {
                    const menu = document.getElementById('plantuml-menu-${diagramId}');
                    menu.style.display = e.button === 2 ? '' : 'none';
                });
                document.getElementById('plantuml-menu-${diagramId}-copyImage').addEventListener('click', async e => {
                    const response = await fetch(diagram.dataset.imageUrl);
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': await response.blob() })
                    ]);
                });
                document.getElementById('plantuml-menu-${diagramId}-copyImageAddress').addEventListener('click', e => {
                    navigator.clipboard.writeText(diagram.dataset.url);
                });

                // Send fence content to plugin
                webviewApi.postMessage('${context.contentScriptId}', ${pluginRequest}).then((response) => {
                   document.getElementById('plantuml-body-${diagramId}').innerHTML = response;
                   document.getElementById('plantuml-menu-${diagramId}').style = "";
                   diagram = document.querySelector("#plantuml-body-${diagramId}>div>*:first-child");
                });
                `.replace(/"/g, '&quot;')

                const outputHtml = `
                <div id="plantuml-root-${diagramId}" class="plantUML-container" tabindex="-1">
                    <div class="hidden" style="display:none">
                        <pre>
\`\`\`plantuml
${token.content}\`\`\`</pre>
                    </div>
                    <div id="plantuml-body-${diagramId}" class="flex-center">
                        <object data="${diagramsTempDir}${previousDiagramId || diagramId}.svg" type="image/svg+xml"></object>
                        <object data="${diagramsTempDir}${previousDiagramId || diagramId}.png" type="image/png"></object>
                    </div>
                    <div id="plantuml-menu-${diagramId}" class="menu" style="display:none">
                        <div class="menu-options">
                            <div class="menu-option"><input id="plantuml-menu-${diagramId}-copyImage" value="Copy image" /></div>
                            <div class="menu-option"><input id="plantuml-menu-${diagramId}-copyImageAddress" value="Copy image address" /></div>
                        </div>
                    </div>
                </div>
                <style onload="${sendContentToJoplinPlugin}"></style>
                `
                previousDiagramId = diagramId
                return outputHtml
            }
        },
        assets: function () {
            return [
                { name: 'style.css' },
            ]
        },
    }
}
