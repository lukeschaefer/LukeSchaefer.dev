const upstreamUrl = "https://api.webbyawards.com/api/PV/GetPVBallot";

const requestBody = {
	PropertyCategoryID: 57647,
	PropertyID: 1,
	PVUserID: 7246627,
} as const;

const requestHeaders = {
	accept: "application/json, text/plain, */*",
	"accept-language": "en-US,en;q=0.9",
	"content-type": "application/json;charset=UTF-8",
	referer: "https://vote.webbyawards.com/",
	"sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
	"sec-ch-ua-mobile": "?0",
	"sec-ch-ua-platform": '"Windows"',
	"sec-fetch-dest": "empty",
	"sec-fetch-mode": "cors",
	"sec-fetch-site": "same-site",
} as const;

export default async function handler() {
	try {
		const response = await fetch(upstreamUrl, {
			method: "POST",
			headers: requestHeaders,
			body: JSON.stringify(requestBody),
		});

		const responseBody = await response.text();
		const contentType = response.headers.get("content-type") ?? "application/json; charset=utf-8";

		return new Response(responseBody, {
			status: response.status,
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": contentType,
			},
		});
	} catch (error) {
		return Response.json(
			{
				error: "Failed to fetch Webby stats",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{
				status: 500,
				headers: {
					"Cache-Control": "no-store",
				},
			},
		);
	}
}
