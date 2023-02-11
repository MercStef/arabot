// SPDX-License-Identifier: GPL-3.0-or-later
/*
    Animal Rights Advocates Discord Bot
    Copyright (C) 2023  Anthony Berg

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Args, Command, RegisterBehavior } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';
import type {
  User,
  Message,
  TextChannel,
  Guild,
  Snowflake,
} from 'discord.js';
import IDs from '#utils/ids';
import { fetchRoles, addExistingUser, userExists } from '#utils/database/dbExistingUser';
import { unRestrict, checkActive } from '#utils/database/restriction';

export class UnRestrictCommand extends Command {
  public constructor(context: Command.Context, options: Command.Options) {
    super(context, {
      ...options,
      name: 'unrestrict',
      aliases: ['ur', 'urv'],
      description: 'Unrestricts a user',
      preconditions: ['ModOnly'],
    });
  }

  // Registers that this is a slash command
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      (builder) => builder
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption((option) => option.setName('user')
          .setDescription('User to unrestrict')
          .setRequired(true)),
      {
        behaviorWhenNotIdentical: RegisterBehavior.Overwrite,
      },
    );
  }

  // Command run
  public async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    // Get the arguments
    const user = interaction.options.getUser('user', true);
    const mod = interaction.member;
    const { guild } = interaction;

    // Checks if all the variables are of the right type
    if (guild === null || mod === null) {
      await interaction.reply({
        content: 'Error fetching user!',
        ephemeral: true,
        fetchReply: true,
      });
      return;
    }

    const info = await this.unRestrictRun(user?.id, mod.user.id, guild);

    await interaction.reply({
      content: info.message,
      fetchReply: true,
    });
  }

  // Non Application Command method of banning a user
  public async messageRun(message: Message, args: Args) {
    // Get arguments
    let user: User;
    try {
      user = await args.pick('user');
    } catch {
      await message.react('❌');
      await message.reply('User was not provided!');
      return;
    }

    const mod = message.member;

    if (mod === null) {
      await message.react('❌');
      await message.reply('Moderator not found! Try again or contact a developer!');
      return;
    }

    const { guild } = message;

    if (guild === null) {
      await message.react('❌');
      await message.reply('Guild not found! Try again or contact a developer!');
      return;
    }

    const info = await this.unRestrictRun(user?.id, mod.user.id, guild);

    await message.reply(info.message);
    await message.react(info.success ? '✅' : '❌');
  }

  private async unRestrictRun(userId: Snowflake, modId: Snowflake, guild: Guild) {
    const info = {
      message: '',
      success: false,
    };

    // Gets mod's GuildMember
    const mod = guild.members.cache.get(modId);

    // Checks if guildMember is null
    if (mod === undefined) {
      info.message = 'Error fetching mod';
      return info;
    }

    // Check if mod is in database
    if (!await userExists(mod.id)) {
      await addExistingUser(mod);
    }

    // Gets guildMember
    let member = guild.members.cache.get(userId);

    if (member === undefined) {
      member = await guild.members.fetch(userId);
    }

    if (member === undefined) {
      info.message = 'Can\'t unrestrict the user as they are not on this server';
      return info;
    }

    // Checks if the user is not restricted
    if (!member.roles.cache.hasAny(
      IDs.roles.restrictions.restricted1,
      IDs.roles.restrictions.restricted2,
      IDs.roles.restrictions.restricted3,
      IDs.roles.restrictions.restricted4,
    )) {
      info.message = `${member} is not restricted!`;
      return info;
    }

    if (await checkActive(userId)) {
      const roles = await fetchRoles(userId);
      await member.roles.add(roles);
    } else {
      await member.roles.add(IDs.roles.nonvegan.nonvegan);
    }

    await member.roles.remove([
      IDs.roles.restrictions.restricted1,
      IDs.roles.restrictions.restricted2,
      IDs.roles.restrictions.restricted3,
      IDs.roles.restrictions.restricted4,
    ]);

    // Unrestricts the user on the database
    await unRestrict(userId, modId);

    info.success = true;

    // Log the ban
    let logChannel = guild.channels.cache
      .get(IDs.channels.logs.restricted) as TextChannel | undefined;

    if (logChannel === undefined) {
      logChannel = await guild.channels
        .fetch(IDs.channels.logs.restricted) as TextChannel | undefined;
      if (logChannel === undefined) {
        this.container.logger.error('Restrict Error: Could not fetch log channel');
        info.message = `Unrestricted ${member} but could not find the log channel. This has been logged to the database.`;
        return info;
      }
    }

    const message = new EmbedBuilder()
      .setColor('#28A745')
      .setAuthor({ name: `Unrestricted ${member.user.tag}`, iconURL: `${member.user.avatarURL()}` })
      .addFields(
        { name: 'User', value: `${member}`, inline: true },
        { name: 'Moderator', value: `${mod}`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `ID: ${member.id}` });

    await logChannel.send({ embeds: [message] });

    info.message = `Unrestricted ${member}`;
    return info;
  }
}
