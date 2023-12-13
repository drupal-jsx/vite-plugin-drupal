import serializePropTypes from '@drupal-jsx/serialize-prop-types';
import { kebabCasePreserveDoubleDash } from '@drupal-jsx/drupal-utils';
import { componentFileNameFromTwigTemplateName } from '@drupal-jsx/drupal-utils-dev';

const reDrupalComponent = new RegExp('/components/(Drupal[\\w\\-]+)\\.jsx$');

export default function drupal({ drupalTemplatesDir, drushPath }) {
  return {
    name: 'vite:drupal',

    configureServer(server) {
      server.ws.on('drupal-jsx:override-twig-template', (data, client) => {
        const componentName = componentFileNameFromTwigTemplateName(data.template);
        const file = Bun.file('src/components/_DrupalComponentTemplate.jsx');
        Bun.write('src/components/' + componentName, file);
      })
    },

    async handleHotUpdate({ file, server, read }) {
      // When the propTypes of a Drupal*.jsx component changes, re-export the
      // new *.template-info.json file.
      const found = file.match(reDrupalComponent);
      if (found) {
        const tagName = kebabCasePreserveDoubleDash(found[1]);

        // Get the old contents of the corresponding template-info.json file.
        const drupalTemplateName = tagName.substring(7);
        const drupalTemplateFileName = `${drupalTemplatesDir}/${drupalTemplateName}.template-info.json`;
        const f = Bun.file(drupalTemplateFileName);
        const oldContents = await f.exists() ? await f.text() : '';

        // Generate the new contents for the corresponding template-info.json
        // file. Await the read() function before calling serializePropTypes()
        // to make sure serializePropTypes() isn't reading from an incompletely
        // written file.
        await read();
        const modulePaths = {};
        modulePaths[tagName] = file;
        const propTypes = await serializePropTypes(modulePaths);
        const newContents = JSON.stringify({ props: propTypes[tagName] });

        if (newContents != oldContents) {
          console.log("Updating " + drupalTemplateFileName);
          // Don't need to await this, because when it's done, handleHotUpdate()
          // will get called for drupalTemplateFileName.
          Bun.write(drupalTemplateFileName, newContents);
        }
      }

      // When a *.template-info.json file changes, clear the Drupal caches that
      // depend on it and reload the page.
      if (file.endsWith('.template-info.json')) {
        await read();
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
