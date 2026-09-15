import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import type { ReactNode } from 'react';
import en from '@/core/i18n/locales/en/adminOperations.json';
import pt from '@/core/i18n/locales/pt/adminOperations.json';
import es from '@/core/i18n/locales/es/adminOperations.json';
import { AdminBranding } from './AdminBranding';
import { AdminHomeLayout } from './AdminHomeLayout';
import { AdminCustomMenu } from './AdminCustomMenu';
import { ColorPicker } from '@/shared/components/ui/ColorPicker';

const mocks = vi.hoisted(() => ({
  getCollections: vi.fn(),
  reorderCollections: vi.fn(),
  updateCollection: vi.fn(),
}));

vi.mock('@/features/Admin/collections', () => ({
  getAdminCollections: mocks.getCollections,
  reorderCollections: mocks.reorderCollections,
  updateCollection: mocks.updateCollection,
}));

vi.mock('../actions', () => ({
  saveAdminBranding: vi.fn(),
  createCustomMenuItem: vi.fn(),
  deleteCustomMenuItem: vi.fn(),
  reorderCustomMenuItems: vi.fn(),
  updateCustomMenuItem: vi.fn(),
}));

vi.mock('@/core/supabase/client', () => ({ createClient: vi.fn() }));

const catalogs = { en, pt, es } as const;

function Provider({ locale, children }: { locale: keyof typeof catalogs; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={{ adminOperations: catalogs[locale] }}>
      {children}
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('admin appearance localization', () => {
  it.each([
    ['en', 'Branding', 'Home rows', 'User menu'],
    ['pt', 'Marca', 'Faixas da página inicial', 'Menu do usuário'],
    ['es', 'Marca', 'Filas de inicio', 'Menú del usuario'],
  ] as const)('provides appearance copy in %s', (locale, branding, home, menu) => {
    const t = createTranslator({ locale, messages: { adminOperations: catalogs[locale] } });
    expect(t('adminOperations.branding.header.title')).toBe(branding);
    expect(t('adminOperations.home.header.title')).toBe(home);
    expect(t('adminOperations.menu.header.title')).toBe(menu);
  });

  it('keeps administrator-authored collection text while translating its frame', () => {
    render(
      <Provider locale="pt">
        <AdminHomeLayout
          initialData={[{
            id: 'collection-1',
            rowType: 'manual',
            title: 'Casa Árbol — 自訂',
            subtitle: 'Texto autoral em três idiomas',
            sortOrder: 0,
            isEnabled: true,
            isSystem: false,
            courseCount: 2,
          }]}
        />
      </Provider>,
    );

    expect(screen.getByRole('heading', { name: 'Faixas da página inicial' })).toBeInTheDocument();
    expect(screen.getByText('Casa Árbol — 自訂')).toBeInTheDocument();
    expect(screen.getByText(/Texto autoral em três idiomas/u)).toBeInTheDocument();
    expect(screen.getByLabelText('Mover para cima')).toBeDisabled();
    expect(screen.getByLabelText('Ocultar do painel')).toBeInTheDocument();
  });

  it('keeps custom menu labels and URLs intact in a localized menu', () => {
    render(
      <Provider locale="es">
        <AdminCustomMenu initialItems={[{
          id: 'menu-1',
          label: 'Ajuda do Henrique',
          url: 'https://example.test/ayuda?ref=á',
          iconName: null,
          sortOrder: 0,
          isEnabled: true,
        }]} />
      </Provider>,
    );

    expect(screen.getByRole('heading', { name: 'Menú del usuario' })).toBeInTheDocument();
    expect(screen.getByText('Ajuda do Henrique')).toBeInTheDocument();
    expect(screen.getByText('https://example.test/ayuda?ref=á')).toBeInTheDocument();
    expect(screen.getByLabelText('Arrastrar Ajuda do Henrique para reordenar')).toBeInTheDocument();
  });

  it('renders branding and color controls with localized accessible names', () => {
    const { unmount } = render(
      <Provider locale="pt">
        <AdminBranding initialSettings={null} />
      </Provider>,
    );
    expect(screen.getByRole('heading', { name: 'Marca' })).toBeInTheDocument();
    expect(screen.getByLabelText('Cor hexadecimal de Primária')).toBeInTheDocument();
    unmount();

    render(
      <Provider locale="es">
        <ColorPicker label="Principal" value="#0235A8" onChange={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByLabelText('Abrir selector de color para Principal')).toBeInTheDocument();
    expect(screen.getByLabelText('Color hexadecimal de Principal')).toBeInTheDocument();
  });
});
