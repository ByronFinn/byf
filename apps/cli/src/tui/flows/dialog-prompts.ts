import type { ModelAlias, Catalog, CatalogModel } from '@byfriends/sdk';
import { catalogModelToAlias, inferWireType } from '@byfriends/sdk';

import type { ColorPalette } from '#/tui/theme/colors';
import { ApiKeyInputDialogComponent } from '#/tui/components/dialogs/api-key-input-dialog';
import { ChoicePickerComponent, type ChoiceOption } from '#/tui/components/dialogs/choice-picker';
import { ModelSelectorComponent } from '#/tui/components/dialogs/model-selector';
import { TextInputDialogComponent } from '#/tui/components/dialogs/text-input-dialog';

import type { DialogHost } from '../types';
import type { ThinkingEffortLevel } from '../types';

export function promptTextInput(
  host: DialogHost,
  colors: ColorPalette,
  opts: {
    readonly title: string;
    readonly subtitle: string;
    readonly initialValue?: string;
    readonly placeholder?: string;
  },
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const dialog = new TextInputDialogComponent({
      title: opts.title,
      subtitle: opts.subtitle,
      initialValue: opts.initialValue,
      placeholder: opts.placeholder,
      colors,
      onDone: (result) => {
        host.close();
        resolve(result.kind === 'ok' ? result.value : undefined);
      },
    });
    host.show(dialog);
  });
}

export function promptApiKey(
  host: DialogHost,
  colors: ColorPalette,
  providerName: string,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const dialog = new ApiKeyInputDialogComponent(
      providerName,
      (result) => {
        host.close();
        resolve(result.kind === 'ok' ? result.value : undefined);
      },
      colors,
    );
    host.show(dialog);
  });
}

export function promptProviderSelection(
  host: DialogHost,
  colors: ColorPalette,
  catalog: Catalog,
  showError: (msg: string) => void,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const options: ChoiceOption[] = Object.entries(catalog)
      .filter(([, entry]) => inferWireType(entry) !== undefined)
      .map(([id, entry]) => ({
        value: id,
        label: entry.name ?? id,
        description:
          typeof entry.api === 'string' && entry.api.length > 0 ? entry.api : undefined,
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label));

    if (options.length === 0) {
      showError('Catalog has no providers with supported wire types.');
      resolve(undefined);
      return;
    }

    const picker = new ChoicePickerComponent({
      title: 'Select a provider',
      options,
      colors,
      searchable: true,
      onSelect: (value) => {
        host.close();
        resolve(value);
      },
      onCancel: () => {
        host.close();
        resolve(undefined);
      },
    });
    host.show(picker);
  });
}

export function promptModelSelectionForCatalog(
  host: DialogHost,
  colors: ColorPalette,
  providerId: string,
  models: CatalogModel[],
): Promise<{ model: CatalogModel; thinkingEffort: ThinkingEffortLevel } | undefined> {
  const modelDict: Record<string, ModelAlias> = {};
  for (const m of models) {
    modelDict[`${providerId}/${m.id}`] = catalogModelToAlias(providerId, m);
  }
  return promptModelSelector(host, colors, modelDict).then((selection) => {
    if (selection === undefined) return undefined;
    const model = models.find((m) => `${providerId}/${m.id}` === selection.alias);
    return model ? { model, thinkingEffort: selection.thinkingEffort } : undefined;
  });
}

export function promptModelSelector(
  host: DialogHost,
  colors: ColorPalette,
  modelDict: Record<string, ModelAlias>,
): Promise<{ alias: string; thinkingEffort: ThinkingEffortLevel } | undefined> {
  return new Promise((resolve) => {
    const firstAlias = Object.keys(modelDict)[0] ?? '';
    const caps = modelDict[firstAlias]?.capabilities ?? [];
    const initialThinking: ThinkingEffortLevel =
      caps.includes('always_thinking') || caps.includes('thinking') || caps.includes('thinking_effort')
        ? 'high'
        : 'off';
    const selector = new ModelSelectorComponent({
      models: modelDict,
      currentValue: firstAlias,
      currentThinkingEffort: initialThinking,
      colors,
      searchable: true,
      onSelect: ({ alias, thinkingEffort }) => {
        host.close();
        resolve({ alias, thinkingEffort });
      },
      onCancel: () => {
        host.close();
        resolve(undefined);
      },
    });
    host.show(selector);
  });
}
