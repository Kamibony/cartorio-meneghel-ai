const fs = require('fs');
const path = 'frontend/src/components/SmartWizard/__tests__/SmartWizardContainer.test.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /import \{ render, screen, fireEvent \} from '@testing-library\/react';/,
  `import { render, screen, fireEvent, waitFor } from '@testing-library/react';`
);

content = content.replace(
  /it\('navigates through intent to review phase', \(\) => \{/,
  `it('navigates through intent to review phase', async () => {`
);

fs.writeFileSync(path, content, 'utf8');
