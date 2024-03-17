
let test_plans = {

	simple: {

		floor_h: 250,
		floors: [
			{
				points: [
					[200,  0, 'cl'],
					[200,400, 'cr'],
				],
				lines: [
					['draw','tl',0,0, 'tr',600, 'br',400, 'bl',-600, 'tl',-400],
					['connect','cl','cr'],
				],
			},
		],
	},

	gable1 : {

		floor_h: 250,
		floors: [
			{
				points: [
					[200,  0, 'cl'],
					[200,400, 'cr'],
				],
				lines: [
					['draw','tl',0,0, 'tr',600, 'br',400, 'bl',-600, 'tl',-400],
					['connect','cl','cr'],
				],
				roofs: [
					{type: 'gable', pitch: 45, eaves: 50, axis: 'h', h: 300, box: [-50,-50,650,450]},
				],
			},
		],

	},

	gable2 : {

	},

}

let test_plan_names = keys(test_plans)

/*
G.test_plan = house({

	floor_h: 250,
	floors: [
		{
			lines: [
				// outside rect
				[[0,0],[500,0]],
				[[500,0],[500,500]],
				[[500,500],[0,500]],
				[[0,500],[0,0]],

				[[0,300],[500,300]],
				[[0,200],[300,200]],
				[[200,0],[200,400]],

				// peninsula
				[[300,200],[300,100]],
				[[300,100],[400,100]],
				[[400,100],[400,200]],
				[[400,200],[300,200]],

				[[200,400],[300,400]],

				[[500,300],[600,300]],
				[[600,300],[600,400],],
				[[600,300],[700,300]],

				// brick-like-layout for testing seg detach on seg move

				// [[700,500],[700,1000]],
				// [[700,1000],[1200,1000]],
				// [[1200,1000],[1200,500]],
				// [[1200,500],[700,500]],
				// [[900,500],[900,1000]],
				// [[700,600],[900,600]],
				// [[700,800],[900,800]],
				// [[900,700],[1200,700]],
			],
		},
		{
			lines: [
				[[100,300],[600,300]],
				[[100,300],[100,100]],

				// second volume

				[[0,600],[600,600]],
				[[600,600],[600,1000]],
				[[600,1000],[0,1000]],
				[[0,1000],[0,600]],

				// TODO: remove
				[[0,800],[50,800]],
				[[600,800],[500,800]],

				// island for testing inside check

				[[100,650],[350,650]],
				[[350,650],[350,900]],
				[[350,900],[100,900]],
				[[100,900],[100,650]],

				[[150,700],[200,700]],
				[[200,700],[200,800]],
				[[200,800],[150,800]],
				[[150,800],[150,700]],

				[[300,700],[250,700]],
				[[250,700],[250,800]],
				[[250,800],[300,800]],
				[[300,800],[300,700]],

			],

			roofs: [
				{type: 'gable', pitch: 45, eaves: 50, axis: 'h', h: 200, box: [0,600,600,1000]},
			],

		},

	],

})
*/
