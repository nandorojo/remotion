import {Browser, Internals, TCompMetadata} from 'remotion';
import {openBrowser} from '.';
import {serveStatic} from './serve-static';

export const getCompositions = async (
	webpackBundle: string,
	config?: {browser?: Browser; inputProps?: object | null}
): Promise<TCompMetadata[]> => {
	const browserInstance = await openBrowser(
		config?.browser || Internals.DEFAULT_BROWSER
	);
	const page = await browserInstance.newPage();

	const {port, close} = await serveStatic(webpackBundle);

	await page.goto(
		`http://localhost:${port}/index.html?evaluation=true&props=${encodeURIComponent(
			JSON.stringify(config?.inputProps ?? null)
		)}`
	);
	await page.waitForFunction('window.ready === true');
	const result = await page.evaluate('window.getStaticCompositions()');
	await close();
	return result as TCompMetadata[];
};
