/**
 * 予定表のひな形。空のパターンで「ひな形から作る」を押したときと、demo アカウントのサンプルに使います。
 */

export const TEMPLATES = [
  {
    id: 'student-weekday',
    name: '学生の平日',
    blocks: [
      { title: '睡眠', start: '23:30', end: '06:30', category: 'sleep' },
      { title: '身支度・朝ごはん', start: '06:30', end: '07:30', category: 'meal' },
      { title: '通学', start: '07:30', end: '08:20', category: 'move' },
      { title: '授業', start: '08:30', end: '12:20', category: 'school' },
      { title: '昼休み', start: '12:20', end: '13:10', category: 'meal' },
      { title: '授業', start: '13:10', end: '15:30', category: 'school' },
      { title: '部活', start: '15:45', end: '18:00', category: 'exercise' },
      { title: '帰宅', start: '18:00', end: '18:45', category: 'move' },
      { title: '夕ごはん', start: '19:00', end: '19:45', category: 'meal' },
      { title: '勉強', start: '20:00', end: '22:00', category: 'study' },
      { title: 'お風呂・自由時間', start: '22:00', end: '23:30', category: 'free' },
    ],
  },
  {
    id: 'worker-weekday',
    name: '社会人の平日',
    blocks: [
      { title: '睡眠', start: '00:00', end: '06:30', category: 'sleep' },
      { title: '身支度・朝ごはん', start: '06:30', end: '07:30', category: 'meal' },
      { title: '通勤', start: '07:30', end: '08:30', category: 'move' },
      { title: '仕事', start: '09:00', end: '12:00', category: 'school' },
      { title: '昼休み', start: '12:00', end: '13:00', category: 'meal' },
      { title: '仕事', start: '13:00', end: '18:00', category: 'school' },
      { title: '帰宅', start: '18:00', end: '19:00', category: 'move' },
      { title: '夕ごはん', start: '19:00', end: '20:00', category: 'meal' },
      { title: '自分の時間', start: '20:00', end: '22:30', category: 'free' },
      { title: 'お風呂・寝る準備', start: '22:30', end: '23:59', category: 'care' },
    ],
  },
  {
    id: 'holiday',
    name: 'のんびり休日',
    blocks: [
      { title: '睡眠', start: '00:30', end: '08:00', category: 'sleep' },
      { title: '朝ごはん', start: '08:30', end: '09:15', category: 'meal' },
      { title: '掃除・洗濯', start: '09:30', end: '10:30', category: 'care' },
      { title: '勉強', start: '10:30', end: '12:00', category: 'study' },
      { title: '昼ごはん', start: '12:00', end: '13:00', category: 'meal' },
      { title: '自由時間', start: '13:00', end: '17:30', category: 'free' },
      { title: 'ランニング', start: '17:30', end: '18:15', category: 'exercise' },
      { title: '夕ごはん', start: '19:00', end: '20:00', category: 'meal' },
      { title: '自由時間', start: '20:00', end: '23:30', category: 'free' },
    ],
  },
];
