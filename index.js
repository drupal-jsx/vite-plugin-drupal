import serializePropTypes from '@drupal-jsx/serialize-prop-types';
import kebabCase from 'just-kebab-case';

const reDrupalComponent = new RegExp('/components/(Drupal[\\w\\-]+)\\.jsx$');

export default function drupal({ drupalTemplatesDir, drushPath }) {
  return {
    name: 'vite:drupal',

    async handleHotUpdate({ file, server }) {
      // When the propTypes of a Drupal*.jsx component changes, re-export the
      // new *.template-info.json file.
      const found = file.match(reDrupalComponent);
      if (found) {
        const tagName = kebabCase(found[1]);

        const drupalTemplateName = tagName.substring(7);
        const drupalTemplateFileName = `${drupalTemplatesDir}/${drupalTemplateName}.template-info.json`;
        const f = Bun.file(drupalTemplateFileName);
        const oldContents = await f.text();

        const modulePaths = {};
        modulePaths[tagName] = file;
        const propTypes = await serializePropTypes(modulePaths);
        const newContents = JSON.stringify({ props: propTypes[tagName] });

        if (newContents != oldContents) {
          Bun.write(drupalTemplateFileName, newContents);
        }
      }

      // When a *.template-info.json file changes, the Drupal page must be
      // reloaded.
      if (file.endsWith('.template-info.json')) {
        server.ws.send({
          type: "full-reload",
        });
      }
    }

  }
}
