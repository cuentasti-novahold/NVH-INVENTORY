import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

/**
 * Example: component test with React Testing Library.
 * Pattern: presentation layer — jsdom environment (default).
 * Copy this structure for tests under src/modules/<m>/presentation/**
 * and client components under src/app/**.
 */

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
    </div>
  );
}

describe('Counter', () => {
  it('renders initial count', async () => {
    await act(async () => {
      render(<Counter />);
    });
    expect(screen.getByText('Count: 0')).toBeInTheDocument();
  });

  it('increments count on click', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<Counter />);
    });

    await user.click(screen.getByRole('button', { name: /increment/i }));
    await user.click(screen.getByRole('button', { name: /increment/i }));

    expect(screen.getByText('Count: 2')).toBeInTheDocument();
  });
});
