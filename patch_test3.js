const fs = require('fs');
const path = 'frontend/src/components/SmartWizard/__tests__/SmartWizardContainer.test.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /it\('navigates through intent to review phase', async \(\) => \{[\s\S]*?\}\);/,
  `it('navigates through intent to review phase', async () => {
    const groundTruth = { entities: [] };

    render(<SmartWizardContainer groundTruth={groundTruth} onGenerated={jest.fn()} />);

    // Step 0: Intent definition
    expect(screen.getByTestId('step0')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit Intent'));

    // Step 1: Clause Selection
    await waitFor(() => {
      expect(screen.getByTestId('step1-clause')).toBeInTheDocument();
    });

    // Advance from 1 to 2
    fireEvent.click(screen.getByTestId('next-btn'));

    // Step 2 should be rendered
    await waitFor(() => {
      expect(screen.getByTestId('step2')).toBeInTheDocument();
    });
  });`
);

fs.writeFileSync(path, content, 'utf8');
