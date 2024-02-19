export const envError = (envName: string) => {
		throw Error(`Missing ${envName} env value`);
}