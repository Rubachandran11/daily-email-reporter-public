require('dotenv').config();
const axios = require('axios');
const XLSX = require('xlsx');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

console.log("🚀 Daily Report Script Initialized");

const API_URL = 'https://employee-tracker-backend-qqes.onrender.com/api/logs';

// Parse optional CLI argument: --date=YYYY-MM-DD
const argDate = process.argv.find(arg => arg.startsWith('--date='));
const testDate = argDate ? new Date(argDate.split('=')[1]) : new Date();

const isSameDay = (d1, d2) =>
  d1.getDate() === d2.getDate() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getFullYear() === d2.getFullYear();

const formatDuration = (seconds) => {
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')} hrs`;
  }
  return `${totalMinutes} mins`;
};

const sendEmailWithAttachment = async (filePath) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.RECEIVER_EMAIL,
      subject: '⚠️ Daily Report - Less Than 8 Hrs Worked',
      text: 'Attached is the employee report of those who worked less than 8 hours.',
      attachments: [
        {
          filename: path.basename(filePath),
          path: filePath,
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Email sent to Mam!');
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
  }
};

const generateReport = async () => {
  try {
    console.log(`📥 Fetching logs for ${testDate.toDateString()}...`);
    const { data: logs } = await axios.get(API_URL);

    const logsForDate = logs.filter(log => {
      if (!log.loginTime) return false;
      return isSameDay(new Date(log.loginTime), testDate);
    });

    const under8Hrs = logsForDate.filter(log => log.activeTime < 28800);

    if (under8Hrs.length === 0) {
      console.log('✅ No one under 8 hours. No report sent.');
      return;
    }

    const exportData = under8Hrs.map(log => ({
      "Employee Name": log.employeeName || "N/A",
      "Login Time": new Date(log.loginTime).toLocaleString(),
      "Logout Time": log.logoutTime ? new Date(log.logoutTime).toLocaleString() : 'Active',
      "Active Time": formatDuration(log.activeTime),
      "Idle Time": formatDuration(log.idleTime),
      "Sleep Time": formatDuration(log.sleepTime),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Auto-fit columns
    const colWidths = exportData.reduce((widths, row) => {
      Object.values(row).forEach((val, i) => {
        const len = String(val).length;
        widths[i] = Math.max(widths[i] || 10, len + 2);
      });
      return widths;
    }, []);
    worksheet['!cols'] = colWidths.map(w => ({ wch: w }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "LessThan8Hours");

    const dateStr = testDate.toISOString().slice(0, 10);
    const filePath = path.join(__dirname, `less_than_8_hours_${dateStr}.xlsx`);
    XLSX.writeFile(workbook, filePath);
    console.log(`📄 Report created: ${filePath}`);

    await sendEmailWithAttachment(filePath);

    fs.unlinkSync(filePath);
    console.log("🗑️ Deleted report file after sending.");
  } catch (err) {
    console.error('❌ Report generation failed:', err.message);
  }
};

// Trigger the report directly
if (require.main === module) {
  generateReport();
}
