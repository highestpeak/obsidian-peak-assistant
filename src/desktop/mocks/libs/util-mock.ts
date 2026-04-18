/**
 * Mock util module for browser environment
 */
export function promisify(fn: Function) {
	return (...args: any[]) => new Promise((resolve, reject) => {
		fn(...args, (err: any, result: any) => {
			if (err) reject(err);
			else resolve(result);
		});
	});
}

export function inherits(ctor: any, superCtor: any) {
	ctor.super_ = superCtor;
	Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}

export function deprecate(fn: Function, _msg: string) {
	return fn;
}

export default { promisify, inherits, deprecate };
