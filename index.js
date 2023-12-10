import serializePropTypes from '@drupal-jsx/serialize-prop-types';
import { kebabCasePreserveDoubleDash } from '@drupal-jsx/drupal-utils';

const reDrupalComponent = new RegExp('/components/(Drupal[\\w\\-]+)\\.jsx$');

export default function drupal({ drupalTemplatesDir, drushPath }) {
  return {
    name: 'vite:drupal',

    async handleHotUpdate({ file, server }) {
      // When the propTypes of a Drupal*.jsx component changes, re-export the
      // new *.template-info.json file.
      const found = file.match(reDrupalComponent);
      if (found) {
        const tagName = kebabCasePreserveDoubleDash(found[1]);

        const drupalTemplateName = tagName.substring(7);
        const drupalTemplateFileName = `${drupalTemplatesDir}/${drupalTemplateName}.template-info.json`;
        const f = Bun.file(drupalTemplateFileName);
        const oldContents = await f.text();

        const modulePaths = {};
        modulePaths[tagName] = file;
        const propTypes = await serializePropTypes(modulePaths);
        const newContents = JSON.stringify({ props: propTypes[tagName] });

        if (newContents != oldContents) {
          // Don't need to await this, because when it's done, handleHotUpdate()
          // will get called for drupalTemplateFileName.
          Bun.write(drupalTemplateFileName, newContents);
        }
      }

      // When a *.template-info.json file changes, clear the Drupal caches that
      // depend on it and reload the page.
      if (file.endsWith('.template-info.json')) {
        const cacheTypes = ['theme-registry', 'render'];
        const promises = cacheTypes.map(
          (type) => Bun.spawn([drushPath, 'cache:clear', type]).exited
        );
        await Promise.all(promises);
        server.ws.send({
          type: "full-reload",
        });
      }
    }

  }
}
