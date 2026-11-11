import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';

afterEach(() => {
  cleanup();
});

describe('App desktop shell', () => {
  it('renders AnimForge Studio landmark structure', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'AnimForge Studio' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
  });
});
