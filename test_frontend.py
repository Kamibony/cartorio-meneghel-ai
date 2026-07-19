from playwright.sync_api import sync_playwright
import time

def test_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Wait a moment for dev server to start
        time.sleep(2)

        try:
            page.goto('http://localhost:5173')
            page.wait_for_selector('text="Painel Cartório AI"')

            # Take a screenshot to verify
            page.screenshot(path="frontend_test.png")
            print("Successfully loaded frontend and took screenshot.")

        except Exception as e:
            print(f"Error accessing frontend: {e}")

        finally:
            browser.close()

if __name__ == '__main__':
    test_frontend()
