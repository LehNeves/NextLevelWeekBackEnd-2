import { Request, Response } from "express";

import db from '../database/connection';
import convertHourToMinute from '../utils/convertHourToMinute';


interface ScheduleItem {
	week_day : number;
	from : string;
	to : string;
}

export default class ClassesController {

	async index(request : Request, response : Response) {
		const filters = request.query;

		const subject = filters.subject as string;
		const week_day = filters.week_day as string;
		const time = filters.time as string;

		if (!subject || !week_day || !time) {
			return response.status(400).json({
				error : "missing filters to search classes"
			});
			
		}
		
		const timeInMinutes = convertHourToMinute(time);
		const classes = await db('classes')
			.whereExists(function() {
				this.select("classes_schedule.*")
				.from("classes_schedule")
				.whereRaw('`classes_schedule`.`class_id` = `classes`.`id`')
				.whereRaw('`classes_schedule`.`week_day` = ??', [Number(week_day)])
				.whereRaw('`classes_schedule`.`from` <= ??', [timeInMinutes])
				.whereRaw('`classes_schedule`.`to` > ??', [timeInMinutes])
			})
			.where('classes.subject', subject)
			.join('users', 'classes.user_id', '=', 'users.id')
			.select(["classes.*", "users.*"]);

		return response.json(classes);
	}

	async create (request : Request,  response : Response) {
		const {
			name,
			avatar,
			whatsapp,
			bio,
			subject,
			cost,
			schedule,
		} = request.body;
	
		const trx = await db.transaction();
	
		try {
			const insertedUsersIds = await trx('users').insert({
				name,
				avatar,
				whatsapp,
				bio
			});
	
			const user_id = insertedUsersIds[0];
	
			const insertedClassesIds = await trx('classes').insert({
				subject,
				cost,
				user_id
			});
		
			const class_id = insertedClassesIds[0];
		
			const classSchedule = schedule.map((scheduleItem : ScheduleItem) => {
				return {
					class_id,
					week_day : scheduleItem.week_day,
					from : convertHourToMinute(scheduleItem.from),
					to : convertHourToMinute(scheduleItem.to),
				}
			});
		
			await trx("classes_schedule").insert(classSchedule);
		
			await trx.commit();
		
			return response.status(201).send();
		} catch (error) {
			await trx.rollback();
			return response.status(400).json({
				error : "Unexpected error while creating new class"
			});
		}
	}
}